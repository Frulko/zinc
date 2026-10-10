# QuickJS bytecode to C (qjs2c): the ZN-599 spike

D44 kept one lever that raises the speed of JavaScript libraries on every target, iOS and consoles included: compiling QuickJS bytecode
to C ahead of time. The report's hand translations were 5.9x (sprite loop) and 4.9x (three.js `multiplyMatrices`) faster than the
interpreter. The gate for this spike: at least 2x on the three.js and matter-js frames, code at most 15x the bytecode, the same test262
results. **Result: no-go (D55).** A mechanical translation gives 1.08x to 1.40x and 53x to 61x the bytecode.

## What was built

- `tools/qjs2c` turns QuickJS-ng functions into C. Each instruction is the interpreter's own opcode body, copied from the interpreter loop
  of `quickjs.c` with the code it falls into and the shared slow paths it jumps to (the `OP_CMP` macro expanded, labels renamed per
  instruction). Operands are constants: the bytecode is a `static const` array, so clang folds operand reads, and jumps become direct.
  There is no dispatch. Atom operands are read at bind time into the function's own table, so two functions of the same shape share a
  body (the field initializers of two classes). Generators, async functions and `finally` (`gosub`/`ret`) are left to the interpreter.
- Patch `0002-aot-hooks` (under `#ifdef ZN_QJS_AOT`): `JS_CallInternal` binds a bytecode function at its first call (file, line, column and
  bytes match) and runs the compiled body in the frame it has set up. An exception returns to the interpreter, which unwinds and resumes
  interpreting at a catch. Backtraces and the GC see the same frame.
- Function selection comes from the profiler of ZN-598: `ZN_QJS_DUMP=<file>` writes each called function with its samples and bytecode.

Reproduce (the matter-js workload needs `bench/qjs/fetch-matter`):

```
cmake -B build-prof -DZN_QJS_PROFILE=ON && cmake --build build-prof --target zinc
ZN_QJS_DUMP=$PWD/three.jsonl build-prof/zinc profile bench/qjs/three.mjs --engine quickjs
tools/qjs2c --dump three.jsonl --top 30 -o gen.c          # --all for every function; --any-file for test262's temporary files
cmake -B build-aot -DZN_QJS_AOT_GEN=$PWD/gen.c && cmake --build build-aot --target zinc
ZN_QJS_AOT_LOG=1 build-aot/zinc run bench/qjs/three.mjs --engine quickjs
```

## Results (Intel Mac, idle, median of 3, Apple clang 17 -O2)

The 30 hottest functions of each workload, 66 in all:

| Workload | Interpreter | qjs2c | Gain | Gate |
|---|---:|---:|---:|---:|
| three (500 meshes, ms/frame) | 7.31 | 5.71 | 1.28x | 2x |
| sprite (10,000 sprites, ms/frame) | 10.19 | 7.28 | 1.40x | |
| objects (2,000 entities, ms/tick) | 1.22 | 1.13 | 1.08x | |
| physics (matter-js, 300 bodies, ms/step) | 9.42 | 7.32 | 1.29x | 2x |

The outputs of the four workloads are identical. With the operand stack in a C array of constant size instead of the frame's, sprite
runs at 7.16 ms against 7.36 ms, within the noise. The array escapes into every slow path, so clang keeps it in memory.

| Code | Functions | Bytecode | C code | Ratio (median) | Gate |
|---|---:|---:|---:|---:|---:|
| the workloads' hot functions | 66 | 16,042 B | 970,896 B | 61x (63x) | 15x |
| every function of the QuickJS T1 programs | 483 | 10,137 B | 576,160 B | 57x (61x) | |
| every function of the test262 regexp subset | 861 | 17,824 B | 950,080 B | 53x (51x) | |

Correctness holds, which is the strength of copying the interpreter's own bodies:

- The QuickJS T1 test passes with all 483 functions compiled; 5 functions with `finally` stay interpreted.
- The test262 regexp subset gives 2,533 of 2,557 passing with 861 functions compiled, the same 24 known failures as the interpreter.
- One bug was found and fixed: the field initializers of two classes, both at line 0 column 0 with the same bytes, shared an atom table.

The generated C compiles quickly: `quickjs.c` alone takes 27 s; with 180,000 lines of generated code it takes 31 s.

## Where the time goes

`sample` on the compiled programs:

- sprite: 71% inside the compiled bodies, `find_own_property` 7.9%, `JS_CallInternal` 5.8%, `JS_GetGlobalVar` 3.4% (`Math`),
  `js_relational_slow` 3.1% (a comparison of doubles leaves the integer fast path).
- three: 72% inside the compiled bodies, `JS_CallInternal` 10.2% (the frame setup of each call), `find_own_property` 3.9%.

Removing the dispatch is all a copy of the interpreter can do. The hand translations of the report were faster because they did what a
compiler does:

- they kept the operand stack in registers;
- they read locals without a reference count;
- with L1.5, they cached a property's offset per site.

The copied bodies keep:

- a store and a load for each push and pop;
- a reference count increment and decrement for each local read;
- a shape lookup for each property access;
- integer-only fast paths;
- the generic call entry.

Removing those needs a compiler of QuickJS bytecode: stack to SSA, borrow analysis, inline caches with shape guards and unboxed
doubles. That is the work of an optimizing JIT, done ahead of time, and it is not a translation of the interpreter. The prior art agrees:
quickjs-aot, a Futamura projection of the interpreter, gained 36%, and the quickjs-ng maintainer expects 1.2x to 1.5x. SpiderMonkey's
AOT reached 2.77x only with inline caches and weval's partial evaluation.

## Decision

D55: no-go for qjs2c. The tool and the patch stay in the tree, both off by default (the default build compiles the release's
instructions), to reproduce these numbers and to rerun the gate when a revisit condition holds. The levers of D44 carry the load:

- native accelerators for library hot spots (`multiplyMatrices` leads three.js with 23% of samples, ZN-598);
- inline caches in the interpreter as an upstream proposal (ZN-600; `find_own_property` and the shape lookups inside the compiled bodies
  are what they remove).
