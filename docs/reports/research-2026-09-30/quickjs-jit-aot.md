# QuickJS JIT tier and real AOT mode for Zinc: research and roadmap

Date: 2026-09-30. Host: Apple M1 Pro (arm64), macOS 24.6, Apple clang 21, load average 5-7 during timings. The Zinc tree was dirty and was not modified. Clones live in the scratchpad: `quickjs-aot/`, `quickjit/`, `quickjs/` (quickjs-ng master).

Legend: **[V]** verified here by running or reading code. **[W]** from a web source, not reproduced. **[I]** my inference.

Paths below are relative to `/Users/mowmow/Lab/zinc` unless prefixed `SP/` (the scratchpad).

---

## 0. Verdict

1. Zinc embeds **quickjs-ng 0.17.0** (amalgam), not Bellard's tree [V]. `plugins/script/vendor/quickjs/quickjs.h:1458-1461` gives `QJS_VERSION_MAJOR 0 / MINOR 17`. `docs/licenses.md:17` says the same. The build is plain `-O2` on the amalgam (`compiler/src/engines.ts:54-55`).
2. Zinc's QuickJS runner **parses ES source at every start**. `runtime/vm/quickjs.cpp:226` calls `JS_Eval(... JS_EVAL_TYPE_MODULE|JS_EVAL_FLAG_COMPILE_ONLY)` on the source text. `compiler/src/engines.ts:130-170` (`bundleJs`) copies `.mjs` files. There is no bytecode path, no `JS_WriteObject` and no AOT. Phase 0 is therefore real and cheap.
3. The only existing AOT that keeps full QuickJS semantics is **ivankra/quickjs-aot** (MIT, Futamura projection). I built it and reproduced the effect: **`qjsc -A` is 1.4x on fib and 2.2x on mandelbrot** against its own tail-dispatch interpreter, and only **1.14x on an object/alloc kernel**. It is based on Bellard's 2025-09-13 tree, not quickjs-ng.
4. **Against quickjs-ng 0.17 the AOT advantage on object code disappears.** ng's interpreter is already about 20-25% faster than that Bellard base on mandelbrot and objects [V]. quickjs-aot on the object kernel was 0.71 s against 0.61 s for stock ng. Any AOT for Zinc must therefore be ported onto ng, or ng's improvements ported to it.
5. **Tail-call dispatch alone buys about 0-6% on this M1 Pro with clang 21 [V].** The published "+25%" (Mac M4, Debian VM) is not reproduced here. Do not budget it as a headline win.
6. The biggest realistic gains, in order of certainty:
   - (a) **Emitter hygiene.** `Math.fround` for f32 costs about 2x on a float loop [V, Section 4.3]. Zero engine work.
   - (b) **Bytecode precompile plus PGO/LTO build.** Startup and about 10-20% [I].
   - (c) **AOT `-A` ported to ng.** 1.5-2.2x on numeric loops, 1.1-1.2x on object code.
   - (d) **Interpreter inline caches for get/put field.** Published +22% Octane geomean on a QuickJS fork [W]. Stock ng 0.17 has none [V].
   - (e) **A baseline JIT.** Expensive, and it does not fix refcounting or the tag/16-byte JSValue costs. The evidence for it on QuickJS is a single MIT third-party project whose own docs contradict each other on wins.
   - (f) **Typed specialization from Zinc types.** The only route to Zinc-VM-class numbers (5-10x over the interpreter on numeric kernels) [I, anchored on `docs/reports/zinc-vm.md:228-241`].
7. iOS: Phases 0, 1 and the IC work are legal there. Phases 2 and 3 as a runtime JIT are not (`docs/reports/ios-core-runtime.md:40`). Phase 3 can still be emitted as AOT.

---

## 1. Zinc's current QuickJS integration [V, read]

| Item | Fact | Ref |
|---|---|---|
| Engine | quickjs-ng 0.17.0 amalgam, MIT | `plugins/script/vendor/quickjs/quickjs.h:1458`, `docs/licenses.md:17` |
| Two consumers | (1) engine runner `runtime/vm/quickjs.cpp` (dev/test tool, `--engine quickjs`). (2) `zinc:script` plugin `plugins/script/native/quickjs.host.cpp` (sandboxed scripting, 667 lines). | |
| Runner setup | `JS_NewRuntime`, 512 MiB memory limit, 1 MiB stack, interrupt handler for the 60 s deadline, custom module loader | `runtime/vm/quickjs.cpp:262-269` |
| Module loading | Reads source text and compiles it with COMPILE_ONLY. Native modules resolve through the `ZincModule` ABI. | `runtime/vm/quickjs.cpp:217-231` |
| Script plugin | Same pattern, compile-from-source with memory, stack and interrupt limits | `plugins/script/native/quickjs.host.cpp:430, 473-483, 525` |
| Build | CMake, `add_library(qjs STATIC quickjs-amalgam.c)` at `-O2` (debug `-O0 -g`) | `compiler/src/engines.ts:54-55` |
| JS emit | TS transformer output as ES modules. `|0` for i32, `Math.fround` for f32, `$z.idiv` for integer division. Types are erased. | `compiler/src/emit-js.ts:1-2, 40, 340` |
| Docs status | "JIT: QuickJS interpreter". Only macOS arm64 exercised. | `docs/engines.md` (table row "JIT") |
| Parity harness | `tests/engines/run.mjs`. Modes: `native`, `zinc-vm`, `zinc-vm-jit` (arm64 only), `quickjs`. Byte-exact stdout, plus `--bench` with 1 warmup + 7 interleaved runs. | `tests/engines/run.mjs:9-11` |
| Numbers (M1 Pro) | fib 322 ms, mandelbrot 716 ms, 100k native calls 10.8 ms (QuickJS), against VM-JIT 67/80/5.1 and native 9.6/22/3.0 | `docs/engines.md`, `docs/reports/engine-abi-2026-09-29.json` |
| Wider numbers | Zinc native vs QuickJS (whole-process wall time): nbody 80x, spectralnorm 79x, mandelbrot 33x, fib 16x, sort 5.4x, strings 2.1x, jsonout 2.2x. Geomean 13.1x. | `docs/reports/PERF.md` |
| Zinc VM design claim | tail-acc interpreter is 6.6-10.7x faster than QuickJS, Tier 1 is copy-and-patch, Tier 2 uses MIR | `docs/reports/zinc-vm.md:17-22, 148-160, 228-241, 247-306` |

Two observations that shape the whole plan:

- **The kernels in PERF.md are numeric.** Zinc UI apps (`examples/hero`, `remarkable/notes`) are closure, object, string and array heavy. Numeric AOT wins will not translate 1:1. I did not profile a real Zinc UI app under QuickJS; that is the first thing to do (Section 6, Phase 0).
- **The QuickJS engine's job in Zinc is parity and dev tooling** (`docs/engines.md` intro), not shipping performance. Investment in it competes with the Zinc VM's own Tier 1/Tier 2 plan (`docs/reports/zinc-vm.md:247+`), which already targets the same use cases with typed semantics. A QuickJS JIT is justified mainly where arbitrary untyped JS must run (`zinc:script`, npm code in the "Zinc Core for iOS" bridge, `docs/reports/ios-core-runtime.md:59`).

---

## 2. Existing work

### 2.1 ivankra/quickjs-aot (`SP/quickjs-aot`, cloned at `cee72b9`, "QuickJS-AOT 20251209") [V]

- **License:** MIT (Bellard's QuickJS license file).
- **Base:** Bellard QuickJS, `VERSION` 2025-09-13. It is **not** quickjs-ng.
- **Mechanism (first Futamura projection):**
  1. The interpreter is first rewritten to **tail-call dispatch**. Every opcode is a separate `js_OP_xxx()` function ending in `__attribute__((musttail)) return js_tail_dispatch_table[*pc](...)`. Uses `preserve_none` when available (`quickjs.c:53-61`).
  2. `aot-parse.py` (90 lines) parses the *preprocessed* `quickjs.c`, extracts each `js_OP_*` body into `aot-table.h` (`Makefile:346-349`), and rewrites the local labels.
  3. `qjsc -A` (`qjsc.c:371-400`) calls `aot_compile()` (`quickjs.c:59798-59945`). For each function it emits one C function with a labeled block per bytecode offset (`pcN:`), the opcode body pasted in, operands constant-folded against a `static const uint8_t aotN_bytecode[]`, and a computed-goto `pc_table` for generator/async re-entry (`quickjs.c:59888-59889`).
  4. `-B` emits a label at every opcode. It is a proxy for a template JIT: it stops the C compiler optimizing across opcodes.
- **Integration and safety model.** This is the key design point for "no compromise":
  - The AOT function has the *same signature* as an interpreter handler and is entered from `JS_CallInternal` (`quickjs.c:17584-17585`) with the **same `JSStackFrame`, `sp`, `arg_buf/var_buf`**. Refcounting, the cycle collector's frame scan, exception unwinding, generators, `cur_pc`/backtraces and interrupts all use the interpreter's own code because the handler bodies are the interpreter's.
  - Serialized bytecode carries an `aot_id` (`quickjs.c:37498, 38433`). On load, `memcmp` against the compiled-in bytecode decides whether to bind `aot_funcs[id]` (`quickjs.c:38537-38546`). A mismatch silently falls back to the interpreter (it prints to stderr). The bytecode stays authoritative, so `Function.prototype.toString`, line numbers and the debugger keep working.
  - Prototype quality: prints "aot enabled" to stderr, no versioning of the handler table, needs a Python step and `clang` (`musttail` + `preserve_none`).
- **Author's numbers [W, README]** (Mac M4, Debian 13 VM, median of 20): geomean v8-v7 base 2582, tail 2800 (+8%), `-A` 3518 (+36% over base). v8-v9 base 5425, tail 6146, `-A` 7784. Per benchmark: Crypto +78% (tail vs base), NavierStokes +52%, Mandreel +68% (`-A` over base +103%); Richards +25%, DeltaBlue +25%. `-B` gives about half the `-A` gain.
- **Author's own future idea:** JIT by compiling hot functions to `.so` and `dlopen`, blocked by QuickJS's many `static` functions.

**My reproduction [V]**, min of 7 wall-clock runs, `-O2`, same machine, one shared build of the runtime library:

| Kernel | Bellard base (computed goto, built from same source with tail path disabled) | quickjs-aot tail interp | quickjs-aot `qjsc -A` | quickjs-ng 0.17.0 (`cmake Release`) |
|---|---:|---:|---:|---:|
| fib(32) | 0.152-0.155 s | 0.151-0.153 s | **0.108-0.110 s** | 0.173 s |
| mandelbrot 400x400, 200 iter, 13.16M iters | 0.982-0.993 s | 0.927-0.942 s | **0.428-0.432 s** | 0.803 s |
| objects (3M `new V().add`, 300k object array, 3M field reads) | 0.809-0.822 s | 0.808-0.825 s | **0.699-0.724 s** | **0.610 s** |
| `tests/microbench.js` total (library-heavy) | 6262 ms (interp) | | 5862 ms (-6%) | |

Sources: `SP/quickjs-aot/bench/{fib,mandel,objs}.js`, `t2.sh`, `t3.sh`. Checksums matched across all binaries.

Reading it honestly:
- `-A` is real and reproducible: **1.4x / 2.2x / 1.14x over its own tail interpreter**.
- **Tail dispatch itself was neutral on this CPU/compiler** (fib +1%, mandel -6%, objs 0%). The author's +25% is not reproduced on M1 Pro / clang 21. Consistent with the wider finding that clang's computed-goto code is already good on arm64. See also Reverberate's follow-up on tail-call interpreters and a compiler regression that inflated CPython's early numbers [W: blog.reverberate.org/2025/02/10/tail-call-updates.html].
- **The quickjs-aot base is older than ng.** Stock ng 0.17 beats the Bellard base on mandelbrot (0.80 vs 0.98) and objects (0.61 vs 0.82), and is slower on fib (0.173 vs 0.152). Result: `-A` on Bellard base **loses to plain ng on the object kernel** and wins about 1.9x on mandelbrot, 1.6x on fib. Porting `-A` to ng is a precondition.
- Size [V]: `microbench.js` (1584 lines) generates a **2.3 MB `.c`** file. Embedded-binary size 1.46 MB with `-A` vs 1.23 MB for plain `qjsc` bytecode-in-binary (both include the engine). Code growth is roughly 20% on this input; the C is large because each opcode body is inlined per instance.
- Compile time of the emitted C was not measured cleanly (my `time` output was swallowed by warnings). The cost is dominated by clang on a multi-MB file: [I] tens of seconds for a large app at `-O2`.

### 2.2 bnoordhuis/quickjit (`SP/quickjit`, HEAD `d5a3e72`) [V]

- QuickJS fork, JIT = bytecode -> C -> **embedded tcc** (`libtcc.c`, `tccgen.c` ... in the tree). README: "same license as QuickJS. tcc is LGPL".
- **Backend files present: `x86_64-gen.c`, `x86_64-link.c`, `i386-asm.c`. There is no `arm64-gen.c`.** So no Apple Silicon, no Pi, no rMPP. Not an option for Zinc's targets.
- Unfinished ("support put_arg opcode" is the last commit) and hand-translates each opcode (as quickjs-aot's README notes). LGPL in a statically linked app is a problem for Zinc's licensing (`docs/licenses.md` is MIT-only for engines). It also needs a compiler at runtime, which is why it cannot reach iOS.

### 2.3 longbridge/quickjs-jit [W: github.com/longbridge/quickjs-jit, PRs #21 and #30]

- MIT. "A high level binding" (Rust, rquickjs-compatible) of **QuickJS-NG with JIT patches**. ABI is tightly coupled to a patch version.
- Design from PR #30: Tier 1 baseline emitting machine code directly (x86-64 primary), Tier 2 lowering to **Cranelift** IR. Inline refcount DUP/FREE in generated code, closures, exception regions, direct native-to-native calls, later polymorphic property ICs (up to 4 shapes), guard elimination, bounds-check elimination. Frame materialization on deopt or exception.
- Claims: 28 of 35 x86-64 Linux scenarios significantly faster than the QuickJS interpreter, 5 tied, 2 slower. A fibonacci scenario "26.97x faster than QuickJS", still 0.72x of Bun's speed. But an earlier doc-PR (#21) reported only "8 faster, 1 tied, 13 slower", so the project is fast-moving and the numbers are self-reported and not reproduced. macOS aarch64 marked untested.
- **Value to Zinc:** reference architecture, an existence proof of a QuickJS-ng JIT with refcounting and exceptions handled, and a codebase to read. Adopting it as a dependency is risky (patch-version ABI lock, x86-64 first, Rust-centric packaging, moving target).

### 2.4 quickjs-ng and Bellard [V + W]

- ng 0.17.0 has **opcode fusion** (`quickjs.c:18941` region comment; docs `diff.md:43`) and a faster allocator, but **no inline caches in the code I inspected**: `OP_get_field` does `find_own_property` + prototype walk on every execution (`quickjs-amalgam.c:31580-31627`, `find_own_property1` at `:17685-17700` is a hash-chain walk). ng's docs page lists "polymorphic inline caching" [W: quickjs-ng.github.io/quickjs/diff/]. I found no such code in the vendored 0.17.0 amalgam or in the ng master clone (`SP/quickjs`, HEAD `2f0aa72`); treat the doc line as unverified or as unreleased.
- ng dispatch: computed goto on non-MSVC/Emscripten (`quickjs-amalgam.c:9222-9233`). No tail-call dispatch.
- ng serialization: `JS_WriteObject/JS_ReadObject` and `qjsc` exist (`quickjs.h:1267-1287`), i.e. Phase 0's precompile is supported API. No heap snapshot facility in QuickJS/ng.
- **gkurt/quickjs PR #9 [W]:** 15 optimizations, **+22.1% Octane geomean** (RayTrace +51%, Crypto +49%, Gameboy +60%, zlib +41%), driven by callgrind. Property caches enlarged, dictionary-mode shapes, dense-array revert, a 256-entry per-context global-variable cache with self-validation, `OP_to_int32`, fast `apply`. Semantics preserved by self-validating cache entries and cache invalidation on descriptor conversion. Peak memory +1.6%. This is the best public evidence for what interpreter-level work gives on QuickJS.
- Bellard's **MicroQuickJS** is a different language subset; see `SP/mquickjs.md` from the earlier assessment. Not relevant to a JIT/AOT for full ES.

### 2.5 weval, LuaAOT, Deegen, copy-and-patch [W]

- **weval** (bytecodealliance): partial evaluator over **WebAssembly** snapshots; the interpreter needs about 100-200 lines of intrinsics (context updates on pc change, specialization requests, virtual locals/stack ops). Results: SpiderMonkey PBL + weval **2.17-2.19x over the same interpreter** (PLDI'25, geomean 2.77x vs the generic interpreter including the PBL gain; up to 4.39x), PUC-Lua 1.84x [W: cfallin.org/blog/2024/08/28/weval/, arxiv.org/abs/2411.10559]. It is Wasm-only, so it applies to QuickJS only if QuickJS is run as Wasm. Not native arm64. Conceptually identical to quickjs-aot's `-A`; the gains are also consistent (about 2x on numeric).
- **LuaAOT** (Gualandi and Ierusalimschy, SBLP 2021): about 500 lines, run-time reduction 20-60%, biggest on Mandelbrot (about 60%), smallest on K-Nucleotide (20%). Gain comes from removing decode/dispatch, so it depends on instruction mix [W: inf.puc-rio.br/~roberto/docs/paper-aot-preprint.pdf]. This matches quickjs-aot: 2.2x (54% less time) on mandelbrot, 1.14x on object code.
- **Copy-and-patch** (Xu and Kjolstad, OOPSLA'21) and **CPython 3.13 JIT**: stencils are compiled by LLVM from C templates with relocation holes, then memcpy'd and patched at run time. Code quality approaches LLVM -O0/-O1 quality with compile times orders of magnitude lower [W]. CPython's 3.13 result was modest (single-digit % on pyperformance) because its bytecode is not typed [W, tonybaloney.github.io/posts/python-gets-a-jit.html], which is the point: a stencil JIT removes dispatch, not the semantics cost of generic operations. Requires clang at build time only. This is the design already sketched for Zinc VM Tier 1 (`docs/reports/zinc-vm.md:247-282`).
- **Deegen** (LuaJIT Remake, arXiv 2411.11469): generates an interpreter and baseline JIT from one description; x86-64 focused in the paper. Too invasive for QuickJS.
- **Static Hermes / Hermes** [W]: typed AOT, 2-5x faster than Hermes interpreter on typed code; even the Hermes team says untyped AOT is not a win over a high-tier JIT. **Porffor**: AOT JS to Wasm/C, incomplete ES coverage, so it violates "no compromise". **Kiesel, Boa**: not investigated in depth (I did not read their code; I list them only as further interpreters without a JIT).

---

## 3. Why QuickJS is slow (and what each technique can fix)

All code refs are the vendored amalgam `plugins/script/vendor/quickjs/quickjs-amalgam.c` unless noted.

### 3.1 The real costs [V read, I estimate]

1. **JSValue is a 16-byte {union, int64 tag} struct on 64-bit** (`quickjs.h:315-335`; NaN-boxing only on 32-bit, `quickjs.h:173-175, 251`). Every operand-stack slot, argument and local is 16 bytes, so twice the memory traffic of a NaN-boxed engine. The tag is checked on every arithmetic op (`OP_add`, `:32138-32165`: int+int with overflow to double, double+double, mixed, else slow path).
2. **Reference counting on every stack move.** `js_dup(pr->u.value)` on every property read and `JS_FreeValue(sp[-1])` after (`OP_get_field`, `:31580-31627`). Every `get_loc`/`put_loc` of a heap value is a dup/free pair. A cycle collector (`gc_decref`) runs on top.
3. **Property lookup is hash chain by atom per access with prototype walk**: `find_own_property` into a per-shape hash table, then `p->shape->proto` on miss. No inline caches at the bytecode site. Method calls do it twice (own property miss then prototype hit). Exotic objects (arrays, typed arrays) take a slow path (`:31607-31612`).
4. **Calls are heavy.** `JS_CallInternal` sets up a `JSStackFrame`, allocates arg/var buffers, checks stack depth and links the frame list. Recursion cost dominates fib.
5. **Dispatch and decode.** Variable-length opcode encoding (`SHORT_OPCODES`), decode of operands on every execution, indirect branch per opcode. This is what tail dispatch and AOT remove; it is a smaller share on modern cores than people expect (my tail-vs-goto result).
6. **No type feedback.** Nothing records "this add always sees int32" or "this site always sees shape S".

### 3.2 What each technique realistically gives

| Technique | Removes | Does NOT remove | Evidence | Expected gain over ng 0.17 |
|---|---|---|---|---|
| Tail-call dispatch | Some dispatch overhead and register spills of the big `switch`/`goto` function | Everything else | [V] 0-6% on M1 Pro / clang 21; [W] +8-25% claimed elsewhere | 0-8% on arm64/clang 21; more with GCC/x86 |
| Bytecode precompile (`JS_WriteObject`) | Lex/parse/compile at startup | Steady state | [I]; no measurement of Zinc apps yet | Startup only (proportional to bundle size); nil steady state |
| PGO + LTO + `-O3` on the amalgam | Bad inlining/layout | | [I] typical interpreter PGO 10-20% | 10-20% |
| Emitter hygiene (avoid `Math.fround` calls etc.) | JS-level overhead Zinc adds | | [V] Section 4.3: 2x on a float loop | 1.2-2x on f32 code |
| `qjsc -A` style AOT | Decode, dispatch, operand loads, some stack traffic; constant folding across opcodes | Refcounting, tag checks, property hashing, call setup | [V] 1.4x fib, 2.2x mandelbrot, 1.14x objects; LuaAOT 1.25-2.5x; weval 1.8-2.2x | 1.5-2.2x numeric, 1.1-1.2x object/closure, about 1.0x string/regexp/library-bound |
| Copy-and-patch baseline JIT | Same as `-A` but at run time, works for `eval`/OTA code | Same | `-B` mode gives about half of `-A` [W]; CPython small wins [W] | About the same as `-A`, minus a bit; no better without ICs |
| Inline caches for get/put field, calls | Hash lookup + proto walk | Refcount, tags | gkurt fork +22% Octane geomean, up to +50% on property-heavy [W] | 10-25% object code (2x on tight property loops) |
| Int/double specialization in a tracing/method JIT | Tag checks, boxing, overflow branches for provably-int loops | Refcount on heap values | quickjs-jit claims 20x+ on fib-like scenarios [W, unreproduced] | 3-10x on numeric kernels, ~1x on object/string code |
| Zinc-typed AOT (Phase 3) | Tag checks, boxing, IC lookups for known classes | Unknown/`any` code | Zinc VM typed estimates 4-11x vs QuickJS [zinc-vm.md:228-241, prototype-derived] | 4-10x numeric, 1.5-3x object code with known shapes [I] |

**Hard ceiling of any bytecode-level speedup that keeps QuickJS's object model:** refcounting and 16-byte values remain. Even quickjs-jit, with inline refcounts and Cranelift, describes itself as slower than Bun on all 35 scenarios [W]. Do not promise V8-class results.

### 3.3 What "no compromise" must mean here

Concrete acceptance rules; each is testable:

1. **Semantics.** Every ES behaviour QuickJS-ng 0.17 produces (including error messages, `Error.stack` line numbers, property enumeration order, getters/setters, Proxy, generators, async, TDZ, `eval`, `with`) is unchanged. Gate: quickjs-ng `tests/` and test262 as run by `SP/quickjs/run-test262.c`, with results equal to the interpreter, plus `tests/engines/run.mjs` byte-exact parity in all four modes.
2. **Bytecode stays authoritative.** Generated code is a specialization of the same handlers keyed by a bytecode hash (as quickjs-aot's `memcmp`, `quickjs.c:38537-38546`). If the hash, engine version or ABI does not match, run the interpreter. No silent divergence.
3. **Deopt/fallback.** For JIT and typed paths: every fast path has a guard and a slow path that is the interpreter handler. Frame state must be exactly reconstructible at every guard, exception and call.
4. **Refcount/GC safety.** At every point where QuickJS can run the cycle collector or call out (any `JS_Call`, allocation, property get on exotic/getter, `JS_FreeValue` with finalizers), the operand stack `sp[]`, `arg_buf` and `var_buf` in the `JSStackFrame` must hold owned values exactly as the interpreter would. AOT via handler pasting gets this for free. A register-allocating JIT must spill before every such point. Reference counts must balance on every exit path, including exceptions.
5. **Exceptions.** Throw goes to the same catch/finally offsets, with `sf->cur_pc = pc` set before anything that can throw (as `OP_get_field` does, `:31615`). Host errors (memory limit, interrupt) produce the same uncatchable behaviour Zinc relies on (`runtime/vm/quickjs.cpp:267`).
6. **Limits.** The interrupt counter and stack-depth checks (`js_poll_interrupts`, `JS_INTERRUPT_COUNTER_INIT 10000`, `:9733, :19534`) must fire on back-edges and calls in compiled code. Zinc's 60 s deadline and `zinc:script` time limits depend on this.
7. **Generators/async** resume into compiled code at any yield/await point (quickjs-aot does it with a per-function `pc_table`, `quickjs.c:59888-59889`).
8. **Reproducible builds.** Output is deterministic and content-addressed; the engine version is part of the fingerprint (`engine.json` already carries a fingerprint, `compiler/src/engines.ts` around `fingerprint: hash(...)`).

---

## 4. Additional measurements I ran

### 4.1 Setup
All on `SP/quickjs-aot/bench/`, M1 Pro, Apple clang 21, `-O2`, load average 5-7 (noisy; I report min of 5-7 runs and only trust differences above about 10%).

### 4.2 Table
See Section 2.1.

### 4.3 What Zinc's emitter costs QuickJS (ng 0.17.0, 10M iterations, `SP/quickjs-aot/bench/fr.js`) [V]

| Loop | ms |
|---|---:|
| `x = x*1.0000001 + 0.5` (plain f64) | 164 |
| `x = Math.fround(x*1.0000001 + 0.5)` (what Zinc emits for f32) | **327** |
| `s += o.a+o.b+o.c+o.d` (4 property reads) | 308 |
| method call `a.f(s)` | 410 |

`Math.fround` is a native C function call through the generic call path, about 16 ns each; it doubles the float loop. `compiler/src/emit-js.ts:40, 185, 202` inserts it after every f32 op. Options that need no engine change: (i) keep f32 math in f64 and `fround` only at stores/escapes when the frontend can prove no observable difference (needs care to keep bit-exact parity with native f32; the parity tests will catch violations), (ii) a QuickJS-specific `OP_fround` opcode (Phase 1 extension: a few lines in ng), (iii) `Float32Array` store/load round trip is worse.

---

## 5. Constraints specific to Zinc targets

- **iOS:** no JIT for third parties (`docs/reports/ios-core-runtime.md:40`). AOT must be *linked at build time* and shipped in the signed app. OTA-updated JS keeps the interpreter. `dlopen` of downloaded code is out.
- **Targets in tree:** macOS, Linux, `rpi1`, `rmpp` (`plugins/script/plugin.json:8-13`). The Pi 3B+ (aarch64) and rMPP (aarch64 Linux) can run arm64 JIT; `rpi1` is ARMv6 32-bit and can only run the interpreter [I]. `musttail`+`preserve_none` need clang >= 19 on x86-64/AArch64 [W: reverberate blog]; on 32-bit ARM or GCC there must be a fallback (quickjs-aot's `#else DIRECT_DISPATCH` branch, `quickjs.c:63-65`).
- **Hardened runtime on macOS:** JIT needs `MAP_JIT` + the JIT entitlement when signed; already handled by Zinc VM Tier 1 (`runtime/vm/jit.h:65-80`, `docs/engines.md` JIT section). Reuse that executable-memory code.
- **Existing Zinc JIT code is not reusable as a QuickJS JIT:** `runtime/vm/jit.h` compiles Zinc's typed 16-byte-instruction bytecode with typed unboxed registers (`jit.h:1-40`, helper `jitHelper<O,T>`); QuickJS bytecode is a stack machine with boxed tagged values. What is reusable: `MAP_JIT` handling, icache flush, the helper-call/status-code protocol ("no C++ exception through JIT frames"), the poll-on-back-edge idea, and test scaffolding.

---

## 6. Roadmap

Effort is engineer-days for one experienced person working in the tree, including tests, not calendar time. Speedups are vs current stock ng 0.17 `-O2` unless stated.

### Phase 0: cheap wins and the measurement harness (4-7 days)

Contents:
1. **Profile a real Zinc UI app under `--engine quickjs`** (hero, notes): cycle count per opcode class, `perf`/Instruments. Decide priorities from data. Add `examples/*`-derived kernels to `tests/engines/run.mjs --bench` (object, closure, string, array). (1-2 d)
2. **Bytecode precompile** in `buildEngine` (`compiler/src/engines.ts:34`): compile the bundle to bytecode at build time (a small host tool linking the vendored amalgam using `JS_WriteObject`; keep the `.mjs` next to it for debug/source maps), and change `loader` (`runtime/vm/quickjs.cpp:226`) to `JS_ReadObject` + `JS_ResolveModule`/`js_module_set_import_meta` handling, falling back to source when the fingerprint (engine version + flags) mismatches. Bytecode is version-specific and unverified, so treat it as trusted build output only, never from `zinc:script` input. (2 d)
3. **Build flags:** `-O3`, LTO, `-fno-semantic-interposition`, and a PGO profile from the bench kernels (`compiler/src/engines.ts:54-55`). (1 d; expect 10-20% [I])
4. **Emitter hygiene** for f32 (`emit-js.ts:40, 185, 202`); measure with the parity matrix. (1-2 d; up to 2x on f32 loops [V])
5. **Optional: port tail-call dispatch to ng** only as the prerequisite for Phase 1 (item is in Phase 1's cost, not here). Do not ship it as a standalone speedup.

Expected: startup improvement proportional to the bundle; steady state +10-25% from PGO/LTO/emitter. Risk: low. Test plan: `node tests/engines/run.mjs` full matrix (all four modes agree byte-exact) and `--bench` before/after; add a test that a stale bytecode fingerprint falls back to source. License: no change (MIT).

### Phase 1: real AOT mode, `zinc build --engine quickjs --aot` (20-30 days)

Goal: the `qjsc -A` mechanism on **quickjs-ng 0.17** (not the Bellard base), iOS-safe (static, no run-time code generation).

Work items:
1. **Port tail-call dispatch to ng's interpreter** (ng has diverged: opcode fusion, different `CASE` macros). This is the prerequisite because `aot-parse.py` extracts `js_OP_*` bodies from the tail-dispatch form. Alternative to avoid diverging from ng: keep the interpreter unchanged and add a *generation-time* extraction (like `aot-parse.py` but from the computed-goto form). More fragile; prefer the tail form on Clang and keep the goto path for GCC/MSVC. (6-9 d)
2. **Port AOT emission** (`aot_compile`, `aot_emit_table`, bytecode `aot_id` serialization, load-time `memcmp` binding) to ng and clean up: drop the stderr prints, add a **hash of (engine version, handler table, bytecode)** so a mismatched interpreter falls back, add `JS_ATOM` remapping check (bytecode atom indices are per-runtime tables; quickjs-aot relies on the deserialized bytecode being the same as compiled-in, which `memcmp` validates only after load). (5-8 d)
3. **Zinc integration:** a `zinc-qjsc` build tool (from the vendored amalgam + a small generator) invoked by `buildEngine` when `--aot` is passed; generated `.c` compiled with clang into the runner via the CMake in `engines.ts:41-70`; `engine.json` fingerprint includes the AOT table hash; `zinc export` ships the binary only. Add `--aot` to `zinc run/build/export/capture`. (4-6 d)
4. **Hardening:** run ng's tests and test262 on the AOT build; async generators, class fields, module top-level await, `eval`/`new Function` (these are not AOT'd and must interpret), stack-overflow and interrupt parity, backtrace line numbers. Compile-time budget: large apps produce multi-MB C (2.3 MB for 1.6k JS lines [V]); add a function-level filter (skip cold startup functions) and a size cap. (5-7 d)

Expected speedup [V/W]: numeric loops **1.5-2.2x** (fib 1.6x, mandelbrot 1.9x vs stock ng [V]; because ng is already faster than the Bellard base on the object case, the port gets about 1.1-1.2x there [V/I]); v8-v7 geomean +25-36% over the interpreter [W]. String/regexp/JSON-bound code about 1.0x [V microbench -6% total]. Binary +~20% [V].

Risks: (a) ng 0.17's handler bodies use more `goto`s and macros than Bellard's; the Python extractor breaks on them. (b) compile time and code size on real apps. (c) `musttail`+`preserve_none` availability (clang >= 19; need CI on Linux/Pi; `rpi1` gets interpreter only). (d) Maintenance: every ng bump regenerates the table (add a CI job that rebuilds and diffs). (e) The `-A` win is per-function; `zinc:script` code loaded at runtime cannot use it, only the build-time-known app.

Test plan: full `tests/engines/run.mjs` with `--engine quickjs --aot` as a fifth mode ("quickjs-aot") so every fixture is byte-compared with native/VM/JIT/QuickJS; the quickjs-ng test suite and test262 under the AOT build (must equal interpreter pass/fail set); `--bench` including new object/closure kernels; a "mismatch falls back" test.

Licensing: quickjs-aot (MIT), quickjs-ng (MIT), Bellard QuickJS (MIT). Generated C inherits the MIT notice of the engine code it embeds; ship the notice as `docs/licenses.md` already does for the engine.

### Phase 1b: interpreter inline caches for get/put field (10-15 days, independent, do in parallel)

- Per-site cache `{shape*, slot index, proto holder?}` in a side table in `JSFunctionBytecode` (operand is a u32 atom, `OP_get_field` at `:31580`), consulted before `find_own_property`. Follow gkurt's self-validating and descriptor-conversion invalidation approach [W]. Must hold a shape reference (or epoch) to avoid ABA on freed/reused shapes; invalidate when a shape is mutated in place (dictionary mode); do not cache exotic or accessor properties.
- Expected 10-25% on property-heavy code [W: +22% Octane geomean, RayTrace +51%]; quantify on Zinc UI kernels.
- Risk: moderate (shape lifetime, `Object.defineProperty`, Proxy, TypedArray receivers). Test: quickjs-ng + test262 + parity matrix + a fuzz test mutating prototypes between calls.
- Note it composes with Phase 1: AOT bodies can constant-fold the cache-slot address.

### Phase 2: baseline JIT with ICs on macOS/Linux/Pi/rMPP (60-100 days, high risk; recommend gating on Phase 0-1 data)

Design options:
- **2A. Copy-and-patch from the tail-dispatch handlers (recommended if a JIT is needed).** Compile each `js_OP_xxx` as a stencil with clang, extract with relocations (Xu and Kjolstad; CPython's `Tools/jit`), emit sequences by memcpy + patch immediates (operands, `pc`, jump targets, cache slots). Same source, so AArch64 and x86-64 come from one handler set, matching the stencil approach already planned for the Zinc VM (`docs/reports/zinc-vm.md:249-282`). Because the interpreter frame is the JIT frame, GC/exception/generator semantics are inherited (like AOT). Add stencils with **ICs and int fast paths** for get/put field, `get_array_el`, `call`, `add/sub/lt` with int32 specialization. Gain over Phase 1 arises only from the specialization, not from JIT itself, since `-A` already removes dispatch. So its real advantage over Phase 1 is **coverage of code unknown at build time** (`zinc:script`, OTA JS).
- **2B. Register-allocating method JIT** (like quickjs-jit's Tier 1 + Cranelift Tier 2) with frame materialization on deopt. Much larger; refcount elision and spill at every safepoint are subtle. Only pursue if 2A + ICs is insufficient. Adopting or forking `longbridge/quickjs-jit` (MIT) is a possibility for reading and borrowing, not for direct adoption (patch-version ABI lock, x86-64 first, macOS aarch64 untested [W]).
- **Reject: bytecode->C->tcc (quickjit)**: x86-64 only [V], LGPL [V], needs a compiler at run time, no arm64.

Work for 2A: stencil generator (15-20 d), arm64 emitter/patcher (10-15 d), x86-64 (10-15 d), executable memory manager reusing `runtime/vm/jit.h:65-80` (3 d), tier-up counters + code cache invalidation on `JS_FreeRuntime` (5 d), ICs (Phase 1b), hardening (15-20 d).

Expected speedup: on top of Phase 1b, another 1.3-2x on numeric loops if int-specialized stencils are added, otherwise about Phase 1 level [I; weval/LuaAOT/`-B` evidence [W] says the dispatch-removal share is about 1.2-2x and the rest needs typing].

Risks: highest of all phases: GC safety at safepoints, generator/async frames, debugger/stack traces, W^X on macOS (`MAP_JIT`, entitlement) and iOS impossibility (interpreter/AOT only there), Linux SELinux/W^X policies on some distros, maintenance against every ng bump. Test: Phase 1 matrix plus a JIT-forced mode (threshold 1) that JITs everything, plus test262 under forced JIT, plus ASan/UBSan (`--debug` path exists in `engines.ts:44`).

Licensing: MIT engine + Zinc code; stencil approach needs clang at build time only. I did not investigate patents on copy-and-patch; CPython (PSF) ships it, and the paper is public, but check before shipping.

### Phase 3: typed specialization using Zinc type info (35-60 days; largest upside on numeric code, works as AOT so it is iOS-safe)

What Zinc knows and QuickJS cannot: `Sema` has `numberKind`, `ZT` types (i32/u32/f32/f64/bool, classes with known layouts) (`compiler/src/sema.ts`, used in `emit-js.ts:9, 99-100, 195-202`), which `emit-js` currently erases. Emit type facts as a **side channel** next to the JS (per function: parameter/local/return kinds, class layouts), and let the AOT generator (Phase 1) consume them:

1. **Numeric locals:** unboxed `int32_t`/`double` C locals for provably-typed slots. Entry guards on argument tags (int32 or number) with jump to the generic AOT'd body on mismatch (deopt = "run the generic version from the function start", legal because the typed version has no side effects before its guards, or from a safepoint map otherwise). `|0` and `fround` emitted by Zinc become native truncate/`(float)` operations.
2. **Known classes:** guard `shape == S` once per function entry or loop preheader, then direct slot loads and stores; deopt if a prototype or shape changes (shape epoch counter).
3. **Refcounts:** keep a plain boxed slot for anything that escapes; unboxed ints/doubles need no refcounting, which is where the largest savings on numeric code come from.
4. **Soundness:** TypeScript types are not sound. Only Zinc's checked subset, where the emitter already inserts runtime coercions (`|0`, `Math.fround`, `$z.idiv`), can be trusted, and every entry guard revalidates at run time. `any`, casts through `unknown` and native ABI boundaries stay generic. This is exactly what "no compromise" requires: the typed body is a *proven* specialization of the emitted JS, not a different language.

Expected speedup [I, anchored on zinc-vm.md:228-241 and PERF.md]: nbody/spectralnorm-class kernels 5-10x over the interpreter (the Zinc VM's est. 8-9x is with typed registers and MIR inlining; a C-compiled typed body with a boxed calling convention should be in the same range), fib/mandelbrot 3-6x; object/string/UI code 1.2-2x. Honest caveat: this converges on the Zinc VM design already in the tree; the incremental value of doing it inside QuickJS is that arbitrary untyped JS and `zinc:script` still run on the same engine and the parity story stays "same JS on QuickJS".

Risks: overflow semantics for i32 (must match `|0`), f32 rounding parity (byte-exact outputs), deopt correctness, effort for class-layout guards. Test: engine parity matrix plus a differential fuzz of typed vs generic on random typed programs.

---

## 7. Recommended order and what not to do

1. **Phase 0 now** (including profiling a real UI app). It gives evidence and low-risk wins.
2. **Phase 1b (ICs) and Phase 1 (AOT) next**, on ng. Prefer ICs first if the profile shows property access dominates UI apps.
3. **Phase 3 typed AOT** only if numeric-heavy Zinc apps must run on QuickJS at speed; otherwise steer such apps to `zinc-vm --jit` or native (they already have those).
4. **Phase 2 JIT last, and only if** OTA/`zinc:script` code performance justifies 60-100 days plus perpetual ng-bump maintenance.
5. **Do not:** adopt tcc/quickjit (x86-64 only, LGPL); adopt Porffor (incomplete semantics); count on tail dispatch alone; promise V8-class performance (refcounting and 16-byte values remain).

## 8. Gaps and unverified items

- I did **not** run quickjs-aot with a Zinc-emitted app or profile a Zinc UI app under QuickJS. All Zinc-app expectations are inference.
- Compile time of `qjsc -A` output was not captured cleanly.
- quickjs-aot's published numbers (Mac M4) and quickjs-jit's numbers are **not reproduced**; only the three kernels above were.
- I did not read Kiesel, Boa, Deegen or Static Hermes source; those rows are from web summaries.
- ng's docs claim polymorphic inline caches; I found none in 0.17.0 or the clone (grep for cache/IC structures, and reading `OP_get_field`). Re-check a newer ng before building ICs, to avoid duplicating upstream work.
- `preserve_none`/`musttail` support on the Pi and rMPP toolchains is inferred from LLVM support for AArch64, not tested there.
- Patent/licensing review for copy-and-patch not done.

## Sources

- quickjs-aot: https://github.com/ivankra/quickjs-aot (README, `qjsc.c`, `quickjs.c`, `aot-parse.py`); tail branch https://github.com/ivankra/quickjs/tree/tail
- quickjit: https://github.com/bnoordhuis/quickjit
- quickjs-ng: https://github.com/quickjs-ng/quickjs ; differences page https://quickjs-ng.github.io/quickjs/diff/
- longbridge/quickjs-jit: https://github.com/longbridge/quickjs-jit (PR #21, PR #30)
- gkurt/quickjs PR #9: https://github.com/gkurt/quickjs/pull/9
- weval: https://github.com/bytecodealliance/weval ; https://cfallin.org/blog/2024/08/28/weval/ ; https://arxiv.org/abs/2411.10559
- LuaAOT: https://www.inf.puc-rio.br/~roberto/docs/paper-aot-preprint.pdf ; https://github.com/hugomg/lua-aot-5.4
- Copy-and-patch: https://fredrikbk.com/publications/copy-and-patch.pdf ; CPython JIT https://tonybaloney.github.io/posts/python-gets-a-jit.html ; PEP 774 https://peps.python.org/pep-0774/
- Tail-call interpreters: https://blog.reverberate.org/2021/04/21/musttail-efficient-interpreters.html ; https://blog.reverberate.org/2025/02/10/tail-call-updates.html
- Deegen: https://arxiv.org/pdf/2411.11469
- Static Hermes / Porffor: https://github.com/facebook/hermes/discussions/1137 ; https://github.com/CanadaHonk/porffor
