# QuickJS: AOT, JIT and the native boundary (research and measurements, 2026-10-09)

Scope: can Zinc make its second engine, QuickJS-ng 0.17.0 (decision D3, `zinc run --engine quickjs`, `zinc:script` of D22), much
faster for real JavaScript libraries (three.js, PixiJS, Phaser, p5.js, matter-js), by AOT compilation, a JIT, engine changes in a fork,
or a cheaper native <-> JS boundary; what each option gains, costs and risks on Zinc's targets (macOS/Linux desktop, Raspberry Pi 1 to 5,
PSP, Vita, 3DS, iPhone 4S on iOS 9, ESP32); and what to do now. Companion reports: [games/js-game-libraries.md](games/js-game-libraries.md)
(the libraries on Zinc, QuickJS 20-60x slower than V8, binding defects D5 and D11) and
[hardware/raspberry-pi-threejs-and-sdk.md](hardware/raspberry-pi-threejs-and-sdk.md) (about 20 us of three.js JavaScript per mesh).

Evidence tags: **[M]** measured here, **[C]** read in Zinc's or QuickJS-ng's code (file given), **[W]** from the web (URL given),
**[I]** inferred or estimated. Measurements: Apple M1 Pro, macOS 15 (Darwin 24.6), Apple clang 17 `-O2` (the flags `next/CMakeLists.txt`
uses for `zn_quickjs`), Node 24.14 for V8. The machine was shared with another session's builds (load average 6 to 11, once 90):
every number is a median of 3 to 7 runs, and differences under about 5% are noise. No `cmake` build of the engine was run: QuickJS-ng
0.17.0 was copied from `next/third_party/quickjs-ng` and built standalone with a small harness.

The harness and every script are outside the repository, in `/Users/mowmow/.claude/jobs/f633d587/tmp/qjs-analysis/` (`README.txt` lists
them): `harness.cpp` (a QuickJS host with a fake `GL` class whose methods copy the shapes of `next/src/gl/webgl_js.cpp` and
`next/src/qjs/qjs.cpp`), `patch.py` and `patch2.py` (measurement-only engine patches: opcode histogram, a typed fast-call path, a
non-throwing typed-array accessor, number fast paths), `aot_proxy.inc` (a hand-written "compiled" sprite loop at four levels), and the
workloads in `js/`.

---

## 0. Summary

1. **Where the time goes** [M]: 85-97% of CPU samples are inside the interpreter function itself (`JS_CallInternal`, with property
   lookup, arithmetic and refcounting inlined). The four workloads execute 0.27 to 5.2 million bytecodes per frame at **2.9 to 4.8 ns
   per bytecode**; 22-45% of them are local-variable loads and stores, 5-34% stack shuffles (`swap`, `dup`, `to_propkey`), only 2-8% are
   calls. Nothing single dominates: removing the TDZ checks of `let`/`const`, adding number fast paths to comparisons and typed-array
   stores each change the workloads by 0-5% (noise). **The cost is the stack-machine interpretation itself**, spread over every opcode.
2. **The ceilings, same JavaScript, same machine** [M]: V8 without its JIT (`node --jitless`: an interpreter with inline caches and a
   register bytecode) is **1.7-2.7x** faster than QuickJS; V8 with its JIT **8-36x**. Interpreter work on QuickJS is bounded by the
   first number, native code is needed for the second.
3. **AOT from QuickJS bytecode to C is the only lever that raises the ceiling on every target** [M]: the sprite loop translated by hand the way a bytecode-to-C compiler would
   emit it (same JSValue semantics, the interpreter's own fast paths, generic calls, no dispatch, no operand stack) runs **5.9x** faster
   than the interpreter (1,540 -> 263 ns per sprite); with per-site inline caches **7.4x** (208 ns); speculative code with shape guards
   and unboxed doubles 18 ns (85x, V8 level); plain C structs 12 ns. The same translation of three.js's `Matrix4.multiplyMatrices`
   is 4.9x faster and bit-identical. Expected on whole call- and allocation-heavy library frames: **1.5-3x** [I]; prior art is lower
   for naive translations (quickjs-aot, a projection of the interpreter: +36% on v8-v7; the quickjs-ng maintainer expects 1.2-1.5x)
   and 2.77x for SpiderMonkey's AOT with inline caches: the gain depends on turning stack slots into registers and eliding refcounts.
   It needs no executable memory, so it works on iOS and consoles, and Zinc already ships the C toolchain and a compile-and-cache
   model (D43). Costs: 12-18x code growth over stripped bytecode (compile only hot functions), a mechanical extraction of the
   interpreter's opcode bodies to stay in sync with quickjs-ng, interpreter fallback for generators, async and `eval`. A spike with a
   hard gate (QJS-06) comes before any commitment.
4. **A QuickJS JIT is not worth it for Zinc**: a baseline (copy-and-patch or template) JIT reaches at best the steady-state speed of the
   C AOT above (an sljit attempt on quickjs-ng: +4.7%; CPython's copy-and-patch JIT: +5-12%), only for code that cannot be compiled
   ahead (rare in games), and cannot run on iOS 9 or retail consoles; an optimizing JIT (the 85x level) is a person-years project. This agrees with D13/D36 on different grounds: JS libraries cannot use Zinc's typed
   AOT (three.js r186 stops the typed frontend at line 3885 of about 60,600, `*[Symbol.iterator]()`), but C AOT of their bytecode can.
5. **The boundary is cheap except for two defects** [M]: a JS -> C method call costs 20-45 ns over the loop (lookup ~10-15, call
   machinery ~10, argument conversion ~2-3 per argument). The typed-array path of `libzn_webgl` costs **1,360 ns** because it uses a
   thrown-and-discarded TypeError as a type test (2,230 ns 20 JS frames deeper: the backtrace grows ~42 ns per frame); with the public
   non-throwing checks 39-43 ns, with a borrowed-pointer accessor 33-36 ns (**-97%**, ZN-567). The `__host_*` thunk's two vectors cost
   139-156 ns against 33-35 ns with stack arrays (D11, ZN-567). A typed fast-call path taken straight from `OP_call_method` (a patch
   in the spirit of V8 Fast API calls) brings 4-double calls from 40 to 28 ns and 1-int calls from 27 to 21 ns.
6. **Batching commands in JS is counterproductive on QuickJS** [M]: recording `uniform4f` as 6 typed-array stores and flushing every 256
   commands costs 300-430 ns per command against 45 ns for the direct call, because each interpreted typed-array store costs 40-50 ns.
   On an interpreter the cheap boundary is **fewer, coarser calls** (accelerators), not a command buffer.
7. **Native accelerators pay immediately** [M]: one native `Matrix4.multiplyMatrices` reading three.js's plain-Array `elements` in
   place is bit-identical (with `-ffp-contract=off`) and 19x faster (1.61 -> 0.084 us), and cuts the three.js CPU frame of 500 meshes
   from 7.9 to 6.0 ms (**-24%**) with no change to three.js.
8. **Plan**: now: the binding fixes (ZN-567), typed fast calls and borrowed accessors as a small patch queue proposed upstream (QJS-02,
   QJS-03), bit-identical accelerators (QJS-04), the bytecode cache (ZN-575/ZN-445: three.core.js parse 22.8 ms -> 1.6 ms from stripped
   bytecode), a hot-function profiler (QJS-05); then the gated bytecode-to-C spike (QJS-06); inline caches in the interpreter only if
   the AOT is a no-go (QJS-07); no JIT; a JIT engine on desktop remains ZN-586's question. Proposed decision D44 in section 9.
9. **Other runtimes made the same choices** [W] (section 6): Flutter ships AOT and keeps its JIT for development; Haxe ships console
   ports through HL/C (bytecode -> C); Unity requires IL2CPP (IL -> C++) on iOS and consoles; Godot refuses a JIT because of iOS and
   gets its speed from typed instructions and `ptrcall`; Hermes precompiles bytecode and has no JIT; React Native's fastest bindings
   (Nitro, generated from typed specs) cost ~73 ns per call, the class QuickJS is already in.

---

## 1. QuickJS-ng 0.17.0 as Zinc uses it

- **Values**: on 64-bit hosts a `JSValue` is a 16-byte struct (`union` + `int64_t tag`); NaN-boxing (8 bytes) is used only when
  `INTPTR_MAX < INT64_MAX` (`quickjs.h:173`). So the 32-bit targets (Pi 1 armhf, PSP, Vita, 3DS, iPhone 4S) already get 8-byte values,
  and the 64-bit ones (desktop, Pi 3-5 aarch64) pay 16 bytes per stack slot, property and array element. Doubles are never
  heap-allocated in either mode: "avoiding boxing" is not an issue in QuickJS; the costs are the tag tests and the 16-byte traffic.
- **Dispatch**: computed goto (`DIRECT_DISPATCH 1` except Emscripten and MSVC, `quickjs.c:54`); a stack machine with many fused opcodes
  (`get_loc0..3`, `put_loc8`, `get_field2`, `call_method`, `if_false8`...).
- **Property access**: shapes with a per-shape hash table (`find_own_property`, `quickjs.c:6836`), walked along the prototype chain at
  every `get_field`; **no inline caches** in 0.17.0: quickjs-ng merged polymorphic ICs in 2023 (+2.4% Octane) and removed them in
  February 2025 (1.037x average on the web-tooling benchmark, prettier 1.54x but typescript 0.89x: the bookkeeping costs code that runs
  once); a monomorphic read IC was closed in May 2026 for flat results ([#120](https://github.com/quickjs-ng/quickjs/pull/120),
  [#876](https://github.com/quickjs-ng/quickjs/issues/876), [#884](https://github.com/quickjs-ng/quickjs/pull/884),
  [#1521](https://github.com/quickjs-ng/quickjs/pull/1521)); the documentation's "polymorphic inline caching" is stale, and
  `quickjs.h` still carries `JS_READ_OBJ_ROM_DATA ... (obsolete, broken by ICs)`. Shapes can be updated in place when not shared, so
  a shape pointer alone is not a version: any cache must also check the atom at the cached slot (as the L1.5 caches of 3.3 do).
- **Calls**: every call enters `JS_CallInternal` recursively on the C stack: interrupt poll, `alloca` of locals and operand stack,
  argument copy when `argc < length`, frame link (`quickjs.c:18039`). A C function goes through `js_call_c_function` (stack check,
  frame push for backtraces, a `switch` on the prototype kind). QuickJS already has typed prototypes for `Math`: `JS_CFUNC_f_f` and
  `JS_CFUNC_f_f_f` (double -> double); they still take the full frame path, so they gain little (34-37 ns against 35-51 ns for a
  generic function converting the same two doubles).
- **Comparisons**: `<`, `>`, `===` have an int-int fast path only (`OP_CMP`, `quickjs.c:20624`); a double goes to `js_relational_slow` or
  `js_strict_eq_slow`. Typed-array stores have no fast path in `OP_put_array_el` (plain Arrays do).
- **Memory**: reference counting plus a cycle collector over the whole heap (pauses measured in the games report, 5.4: p99 11.8 ms
  with 100k live objects, 99-171 ms with 1M); a small-block arena allocator for blocks up to 512 bytes (`quickjs.c:259`), so the
  allocator underneath matters little: QuickJS on mimalloc (`JS_NewRuntime2`) was within noise of the system allocator on all four
  workloads [M].
- **Bytecode**: `JS_WriteObject`/`JS_ReadObject` with `JS_WRITE_OBJ_STRIP_SOURCE | JS_WRITE_OBJ_STRIP_DEBUG`. three.core.js r186
  (1,424 KB of source): parse and compile 22.8 ms, bytecode read back 1.6 ms (438 KB stripped; 2.6 ms and 2,348 KB with debug
  information); matter.js (366 KB): 9.5 ms -> 0.4 ms (87 KB) [M]. This is ZN-575/ZN-445's job.

Zinc's integration [C]: `next/src/qjs/qjs.cpp` generates one `__host_<name>` function per runtime-table row (`hostFn`, one
`JS_CFUNC_generic_magic` thunk decoding arguments by the row's letters, `qjs.cpp:66`); `next/src/gl/webgl_js.cpp` installs WebGL as a
native class with a few hundred methods through one magic thunk (`callThunk`, `webgl_js.cpp:1150`) and ~600 constants on the prototype, built as
`libzn_webgl` and loaded with `dlopen` (D40). `next/src/qjs/ext.cpp` holds the JS shims (TextEncoder/Decoder, AbortController).

---

## 2. Where QuickJS time goes

### 2.1 Workloads [M]

Four workloads, the same files on QuickJS (harness) and Node (`js/`):

- **three**: real three.js r186 `three.core.js`, 500 meshes in 50 groups; per frame: animate rotations, `scene.updateMatrixWorld()`,
  frustum culling with bounding spheres, depth key and render-list push (WebGLRenderer's `projectObject`), sort, then per object
  `modelViewMatrix`, `normalMatrix` and a uniform-cache compare (`arraysEqual` + copy of 16 floats). No GL.
- **sprite**: the games report's sprite kernel (move, bounce, 4 rotated corners into a vertex Array), 10,000 sprites.
- **physics**: matter-js 0.20 (unmodified UMD build), 300 bodies piled in a box, `Engine.update` at 60 Hz.
- **objects**: game/UI-style logic: 2,000 entities with polymorphic components in plain objects, `Map` lookups by string, an event
  emitter with closures, short-lived objects, `filter`/`map`.

| Workload | QuickJS 0.17 | QuickJS + mimalloc | V8 `--jitless` | V8 (JIT) | QuickJS / jitless | QuickJS / V8 |
|---|---:|---:|---:|---:|---:|---:|
| three (ms/frame) | 7.91 | 8.00 | 3.73 | 0.225 | 2.1x | 35x |
| sprite (ms/frame) | 15.31 | 15.36 | 5.61 | 0.465 | 2.7x | 33x |
| physics (ms/step) | 13.76 | 13.47 | 7.64 | 0.385 | 1.8x | 36x |
| objects (ms/tick) | 1.28 | 1.35 | 0.74 | 0.156 | 1.7x | 8.2x |

A second pass under heavier load gave the same ratios (2.0/3.0/1.8/2.0x and 36/36/36/9.8x). three.js costs 16 us per mesh here,
consistent with the ~20 us per mesh (with `setProgram` and GL) of the Pi report.

### 2.2 Opcode mix [M]

Dynamic opcode histograms from an instrumented build (`QJS_OP_HIST`: a counter in the dispatch macro; `hist.py`):

| Workload | Bytecodes per frame | ns per bytecode | JS calls per frame | Top opcodes |
|---|---:|---:|---:|---|
| three | 2.3 M | 3.4 | 25 k (+9 k to C) | `get_loc_check` 19.8%, `swap` 11.9%, `mul` 6.4%, `get_field` 5.7%, `set_loc_uninitialized` 4.1%, `get_array_el` 4.0%, `to_propkey` 4.0% |
| sprite | 5.2 M | 2.9 | 0 (+23 k to C) | `swap` 23.0%, `get_loc_check` 18.0%, `to_propkey` 7.7%, `add` 5.9%, `get_field` 4.6%, `get_var` 3.9%, `put_array_el` 3.8% |
| physics | 2.9 M | 4.7 | 6 k (+3 k to C) | `get_loc8` 23.1%, `get_field` 14.3%, `mul` 5.9%, `if_false8` 5.2%, `put_loc8` 4.6%, `lt` 4.0% |
| objects | 0.27 M | 4.8 | 11 k (+2 k to C) | `get_loc_check` 15.8%, `get_field` 11.5%, `get_arg0` 5.8%, `get_field2` 5.2%, `return` 4.0%, `call_method` 3.9% |

By category: local/argument/closure variable access 22-45%, stack shuffles and constants 5-34%, arithmetic 5-16%, named property get
6-18%, element get/put 4-6%, branches 5-10%, calls and returns 0.4-8%. `get_loc_check` and `set_loc_uninitialized` come from
`let`/`const` (TDZ checks the compiler cannot prove away); `swap` and `to_propkey` from compound and element assignments
(`s.x += s.vx`, `verts[o + 1] = ...`); `get_var` from top-level `const` read as globals.

### 2.3 Profiles and ablations [M]

- `sample` on each workload: `JS_CallInternal` self time is 85% (objects), 90% (three), 96% (physics), 97% (sprite). The rest:
  `js_strict_eq2` 5% in three (`!==` on doubles in `arraysEqual`), `js_relational_slow` + `JS_ToPrimitiveFree` 1-6% in sprite and
  physics (comparisons with a double), `JS_GetPropertyInternal` 4% in objects (string keys, `Map`), `js_map_get`, `rqsort`.
- **TDZ checks**: the same programs with `let`/`const` rewritten to `var` (no `get_loc_check`, allows `inc_loc`): -2 to +2%, noise.
- **Number fast paths** (patch `QJS_FASTCMP`: doubles in `<`/`>`/`===`, identity for same-tag objects/booleans in `===`, typed-array
  stores in `put_array_el`): -2 to +3%, noise; with the `var` rewrite physics -8%, others unchanged.
- **Allocator**: mimalloc under QuickJS: noise (the arena allocator already absorbs small blocks).

Reading: per-opcode tuning is exhausted at the few-percent level. QuickJS spends ~3-5 ns per bytecode because it is a stack machine
with 16-byte values, refcount traffic on every load, a hash lookup per property access and a C-stack frame per call; V8's interpreter
does the same work in about half the time with a register bytecode and inline caches. Bigger gains need fewer instructions (a register
VM, superinstructions, caches) or no interpretation at all (native code).

### 2.4 Micro costs [M] (ns per operation over the empty loop; `js/micro.js`)

| Operation | QuickJS | V8 jitless | V8 JIT |
|---|---:|---:|---:|
| empty `for (let i...)` iteration (absolute) | 18.6 | 7.1 | 0.5 |
| own field read `o.y` | 19 | 5 | ~0 |
| own field write | 10 | 5 | ~0 |
| method lookup on prototype, depth 1 / 3 | 17 / 20 | 3 / 4 | ~0 |
| getter / setter call | 47 / 44 | 32 / 34 | ~0 |
| JS call `id(i)` / method call `v.add(w)` | 36 / 88 | 24 / 58 | 0.5 / 0.8 |
| closure creation | 141 | 47 | 5 |
| object literal `{x,y,z}` / `new V3(x,y,z)` | 132 / 198 | 20 / 39 | 2 / 2 |
| Array read / write | 27 / 41 | 16 / 11 | ~0 |
| Float32Array read / write | 29 / 42 | 17 / 16 | ~0 |
| `Math.sin(i)` | 51 | 61 | 23 |
| string concat `'k' + i` | 66 | 28 | 18 |

The empty loop alone is 9 opcodes (`get_loc_check` x2, `put_loc_check`, `post_inc`, `drop`, `lt`, `get_arg0`, `if_false8`, `goto8`),
~2.1 ns each. Allocation is the most expensive single operation (130-200 ns per small object, 141 per closure): libraries that allocate
temporaries per object per frame pay it directly, and three.js mostly avoids that (it reuses `_vector` scratch objects).

three.js operations [M] (`js/three_ops.mjs`), us per call:

| Operation | QuickJS | V8 jitless | V8 JIT |
|---|---:|---:|---:|
| `Matrix4.multiplyMatrices` | 1.62 | 0.90 | 0.029 |
| `Matrix3.getNormalMatrix` | 1.64 | 0.72 | 0.014 |
| `Matrix4.compose` | 1.11 | 0.40 | 0.010 |
| `Object3D.updateMatrix` | 1.78 | 0.82 | 0.032 |
| `Object3D.updateMatrixWorld` (leaf) | 2.05 | 0.78 | 0.033 |
| `Sphere.applyMatrix4` + `Frustum.intersectsSphere` | 2.07 | 1.44 | 0.021 |
| `Vector3.applyMatrix4` | 0.49 | 0.35 | 0.008 |

A mesh in the three workload goes through about eight of these per frame: that is where its 16 us go.

---

## 3. AOT options

### 3.1 What exists

| Project | What it does | Reported result | Source |
|---|---|---|---|
| `qjsc -c` / `-e` (QuickJS) | C file holding the bytecode as a byte array (plus `main()` with `-e`); still interpreted | start-up only | [quickjs.texi](https://github.com/bellard/quickjs/blob/master/doc/quickjs.texi) |
| `qjs --compile`, `qjsc -b` (quickjs-ng) | standalone executable / raw bytecode | start-up only | [quickjs-ng commits](https://github.com/quickjs-ng/quickjs/commits/master) |
| quickjs-aot (ivankra) | Futamura projection of QuickJS's interpreter per function, compiled by clang `-O2` | v8-v7 geomean +36% (2,582 -> 3,518); tail-call dispatch alone +8.5% | [quickjs-aot](https://github.com/ivankra/quickjs-aot) |
| quickjit (bnoordhuis, 2023) | bytecode -> C -> TCC, unfinished | - | [quickjit](https://github.com/bnoordhuis/quickjit) |
| quickjs-ng issue #1393 | bytecode-to-C AOT proposal | closed 2026-03-22; maintainer expects 1.2-1.5x, "do it in a fork" | [#1393](https://github.com/quickjs-ng/quickjs/issues/1393) |
| JWST (Huawei) | QuickJS bytecode -> LLVM IR | talk only | [W3C TPAC 2023](https://w3.org/2023/Talks/TPAC/ac-lt-js-wasm) |
| Javy bytecode -> Wasm (Igalia) | QuickJS bytecode compiled to Wasm | ~1.2x on calls, 1.5-3.5x on closures (with Wasm GC); upstreaming planned | [Igalia 2026-05](https://blogs.igalia.com/compilers/2026/05/25/five-years-of-javascript-on-webassembly/) |
| SpiderMonkey + weval | AOT of JS with a precompiled IC corpus | 2.77x over the interpreter on Octane | [AOT JS](https://cfallin.org/blog/2024/08/27/aot-js/) |
| Porffor | own JS -> Wasm/C AOT compiler and runtime | ~1.86x QuickJS, ~V8 jitless; alpha, most projects do not run | [porffor.dev](https://porffor.dev/) |
| Static Hermes | typed JS -> native (C via `-emit-c`) | ~10x on typed nbody; untyped not published | [slides](https://speakerdeck.com/tmikov2023/static-hermes-react-native-eu-2023-announcement) |
| Haxe HL/C, Unity IL2CPP | VM bytecode -> C/C++ for consoles and iOS | production (section 6) | section 6 |

The gap between quickjs-aot's +36% and this report's 5.9x (3.3) is what the translation keeps: a projection of the interpreter
keeps the operand stack in memory and every `dup`/`free` pair, so clang cannot put values in registers; the hand translation of 3.3
turns stack slots into C locals (QuickJS bytecode has a static stack depth at every pc) and borrows locals instead of duplicating
them. A generator has to do those two things automatically to land near 3.3's numbers; that is what the spike QJS-06 must prove first.

### 3.2 (a) qjsc and the bytecode cache

`qjsc` compiles JavaScript to QuickJS bytecode and can wrap it in a C file as a byte array; the program still runs in the interpreter.
Its value is start-up: the parse of three.core.js (22.8 ms here, 0.8 s estimated on a Pi 3B+ and 2.5-3.5 s on a Pi 1 in the Pi report)
becomes a 1.6 ms read. Zinc has the tasks (ZN-445 bytecode in packs, ZN-575 cache for `zinc run`): keep line tables in development
builds (stack traces) and strip them in exports. No run-time speed-up.

### 3.3 (b) QuickJS bytecode to C, measured by proxy [M]

There is no QuickJS-bytecode-to-C compiler to measure, so the sprite loop was compiled by hand at four levels (`aot_proxy.inc`), inside
`quickjs.c` so it uses the interpreter's own inline helpers, and checked against the interpreter's result (same checksum):

| Level | What the code does | ns per sprite | vs interpreter |
|---|---|---:|---:|
| Interpreter | QuickJS-ng 0.17.0 | 1,540 | 1x |
| **L1** untyped bytecode -> C | every value a JSValue; the interpreter's fast paths per opcode (shape hash lookup, tag-checked arithmetic, `js_relational_slow` for double compares, fast-array element access with slow fallback); globals looked up at every use; `Math.cos` fetched from the global object and called through `JS_CallInternal`; locals in C variables (no operand stack, no dispatch, no dup/free of `s` per access) | 263 | **5.9x** |
| **L1.5** L1 + inline caches | per-site static cache (shape, slot) guarded by the atom at the slot; cached globals; `Math.cos/sin` called directly after an identity check | 208 | **7.4x** |
| **L2** speculative | one shape guard per sprite, fixed slots, doubles unboxed in registers, constants read once (what an optimizing JIT with type feedback, or an AOT with guards and a deopt path, produces) | 18 | 85x |
| **L3** C structs | the same arithmetic on a `struct` array (what Zinc's typed AOT or V8's optimized code reaches) | 12 | 128x |

For comparison: V8 runs this loop at 21-24 ns per sprite and Zinc AOT at 57-60 ns (games report 5.1, `float` vertex stores).

The same L1 translation of a real library method, three r186's `Matrix4.multiplyMatrices` (three `elements` lookups, 32 element
reads, 112 tag-checked multiply/adds, 16 element writes), installed in place of the JS method: 1.61 -> 0.33 us per call (**4.9x**),
bit-identical results, and the three workload 7.9 -> 6.5 ms per frame (-17%) from this one function [M]. The typed native version of
5.5 does it in 0.084 us: L1 keeps the tag tests and JSValue traffic that a typed accelerator drops.

What L1 removes is exactly what the profile says the interpreter spends: dispatch, operand-stack traffic, refcount pairs on locals
and the instruction-by-instruction view (clang folds the tag tests of constants and keeps temporaries in registers). What it keeps:
property hash lookups, tag tests, generic calls, allocation. Expected gain by workload [I]: numeric loops 5-7x (measured);
three.js-style code 2-3x (most of its time is the same kind of bytecode, but 50 JS calls and 18 C calls per mesh keep a frame setup
each); allocation- and `Map`-heavy code (objects, physics broadphase) 1.3-2x; benchmark suites dominated by regexps, strings and GC
(v8-v7) about +36% (quickjs-aot, 3.1).

Cost of the C route [M/I]:

- **Code size**: L1 of the 1,351-byte (stripped bytecode module) sprite function is 24.4 KB of arm64 code, L1.5 16.5 KB with the
  cache helpers out of line: **12-18x** the bytecode. All of three.core.js (438 KB stripped) would be 5-8 MB: compile only the hot
  functions found by a profile (QJS-05), keep the rest interpreted.
- **Coverage**: about 250 opcodes. Generators and async functions (resumable frames), `with`, direct `eval`, `arguments` aliasing and
  rare opcodes fall back to the interpreter per function; exceptions go through the existing `JSStackFrame` so backtraces keep working.
- **Maintenance**: write the opcode bodies once as inline functions extracted mechanically from `quickjs.c`'s `CASE(OP_...)` blocks,
  so the AOT tracks quickjs-ng releases; a fork that hand-copies semantics would drift.
- **Toolchain and targets**: the generated C compiles with the pinned `zig cc` on every Zinc target, and the run model already exists:
  D43 compiles and caches programs that draw. No executable memory at run time, so iOS 9, PSP, Vita and 3DS are covered by the same
  path. Determinism: compile with `-ffp-contract=off` (D14); the accelerator test of section 5.5 shows that this gives bit-identical
  doubles.
- **Effort** [I]: a generator for the common opcodes with interpreter fallback, 4-6 weeks; inline caches +2 weeks; hot-function
  selection and packaging +1-2 weeks. Hence a spike with a gate (QJS-06) before a decision.

### 3.4 (c) Zinc's typed AOT for JavaScript libraries

Zinc compiles a typed subset of TypeScript (interpreter and AOT); `zinc infer` (prototype `compiler/src/infer.ts`, decision 0014;
`zinc infer` in Next reports Z0109 sites) types plain JavaScript where it can and leaves the rest as `Dyn`. For libraries this does not
work [M/C]: `zinc check three.core.js` stops at line 3885 of about 60,600 on `*[ Symbol.iterator ]()` (Z0005, computed generator member),
and npm imports are a known gap (parity report row RC-PKG: three, inferno, lodash). Beyond syntax, a library like three.js is
untyped where it matters (polymorphic `object.material` arrays, mixins, `isMesh` flags), so most values would be `Dyn`, whose objects
are insertion-ordered hash maps with no inline caches (0014): slower than QuickJS on property-heavy code (M4 `dynsum`: interpreter
39.2 ms vs QuickJS 30.2). Typed AOT stays the path for code written for Zinc (the native tier: `zinc:game`, ZN-562 `zinc:gl`, the
three subset), not for npm libraries.

### 3.5 (d) A baseline compiler run ahead of time

The same code generator as a baseline JIT, run at build time into machine code, avoids W^X and works on iOS and consoles. For Zinc it
is dominated by (b): (b) produces the same code (L1/L1.5) through C, gets every architecture (arm64, x86-64, ARMv6/v7, MIPS32) from
the existing toolchain, and lets clang optimize across opcodes; a direct machine-code emitter needs one backend per architecture for
no extra speed. Its only advantage, no C compiler at build time, does not apply: `zinc build` already depends on the pinned `zig cc`.

---

## 4. JIT options

### 4.1 Prior art and platform rules [W]

| System | What it is | Reported gain | Note for Zinc |
|---|---|---|---|
| V8 Sparkplug | baseline compiler: one linear pass over Ignition bytecode, no IR, interpreter frame layout, calls shared builtins | +41% Speedometer, +45% JetStream over Ignition; +5-15% on real browsing ([maglev](https://v8.dev/blog/maglev), [sparkplug](https://v8.dev/blog/sparkplug)) | the L1 level: V8 gets it on top of an interpreter that already has ICs |
| V8 jitless | Ignition only (iOS, TVs, consoles) | Speedometer 2 ~40% slower, Web Tooling ~80% slower, a TV app 6% ([jitless](https://v8.dev/blog/jitless)) | this is the 1.7-2.7x-over-QuickJS engine of 2.1 |
| SpiderMonkey PBL + weval | interpreter of CacheIR IC stubs; weval partially evaluates the interpreter into AOT code with a precompiled IC corpus (~2,367 stubs), no run-time codegen | PBL 1.26x on Octane, with weval 1.58x; full AOT JS 2.77x geomean over the interpreter (1.70-4.39x), the native baseline JIT ~5x; weval paper 2.17x ([PBL](https://cfallin.org/blog/2023/10/11/spidermonkey-pbl/), [AOT JS](https://cfallin.org/blog/2024/08/27/aot-js/), [PLDI 2025](https://cfallin.org/pubs/pldi2025_weval.pdf)) | the closest prior art to QJS-06: AOT with ICs, no executable memory, ~2-3x on whole benchmarks |
| CPython copy-and-patch JIT (PEP 744) | stencils compiled by LLVM at build time, copied and patched at run time | 3.13/3.14 "often slower than the interpreter"; 3.15 alphas +11-12% (macOS arm64), +5-6% (x86-64); work frozen in June 2026 pending a PEP ([PEP 744](https://peps.python.org/pep-0744/), [blog 2026-03](https://blog.python.org/2026/03/jit-on-track/), [SC announcement](https://discuss.python.org/t/an-announcement-from-the-steering-council-regarding-the-jit-project/107638)) | a template JIT over an already specialized interpreter gains little; most of L1's 5.9x here comes from QuickJS's stack traffic and refcounts, which CPython's specializing interpreter had already reduced |
| Copy-and-patch paper, Deegen / LuaJIT Remake | stencils generated from a semantic description; interpreter + baseline JIT | codegen ~100x faster than LLVM -O0; LJR baseline JIT 4.6x PUC Lua, 33% slower than LuaJIT, x86-64 only ([OOPSLA 2021](https://arxiv.org/pdf/2011.13127), [Deegen](https://arxiv.org/html/2411.11469v2)) | the right design if a JIT were wanted: derive templates from the interpreter (the same idea as 3.3's mechanical extraction) |
| QuickJS JIT attempts | quickjs-ng issue #659 (open): maintainers estimate dispatch at 5-25% of time because opcodes are "fat"; an experimental sljit PR (2026-02, machine-written): +4.7% overall, most tests slower; Longbridge's `quickjs-jit` (Rust, Cranelift, tiered, on quickjs-ng): 32-45x on micro-benchmarks with the second tier forced | ([#659](https://github.com/quickjs-ng/quickjs/issues/659), [#1332](https://github.com/quickjs-ng/quickjs/pull/1332), [quickjs-jit](https://docs.rs/crate/quickjs-jit/latest)) | a template JIT over QuickJS gains little; large gains need a typed tier (Cranelift, type feedback): a separate engine in all but name, desktop only |
| PrimJS (Lynx) | QuickJS fork: template interpreter in assembly (native stack, top-of-stack caching), mark-sweep GC; arm64 only | Octane +28% over QuickJS (M1 Max) ([benchmark](https://github.com/lynx-family/primjs/blob/develop/docs/benchmark.md), [template interpreter](https://github.com/lynx-family/primjs/blob/develop/docs/template_interpreter.md)) | the size of an interpreter rewrite's gain, for one architecture |
| Static Hermes | typed TS/Flow compiled to native (also `-emit-c`) | nbody 5,511 ms interpreted -> 565 ms typed native; untyped native numbers not published ([2023](https://speakerdeck.com/tmikov2023/static-hermes-react-native-eu-2023-announcement), [2024](https://speakerdeck.com/tmikov2023/optimizing-with-static-hermes-chain-react-2024)) | the typed half is what Zinc's own AOT already is; Hermes V1 (RN default since 0.84) ships no native code yet ([RN 0.84](https://reactnative.dev/blog/2026/02/11/react-native-0.84)) |
| Porffor | JS -> Wasm or C, 100% AOT, own runtime | alpha; ~86% faster than QuickJS, ~14% faster than `node --jitless`, 13-17x slower than JIT engines; "most existing JS projects will not work" ([porffor.dev](https://porffor.dev/)) | shows the AOT-without-types ceiling is about V8-jitless level, consistent with L1/L1.5 |
| Register vs stack VMs | Shi et al., VEE 2005 | 47% fewer instructions, 32% less time ([paper](https://usenix.org/legacy/events/vee05/full_papers/p153-yunhe.pdf)) | the size of a QuickJS register-VM rewrite's gain |
| Tail-call interpreters | CPython 3.14 `musttail` dispatch | 3-5% geomean (the first 9-15% was a compiler regression) ([3.14](https://docs.python.org/3.14/whatsnew/3.14.html), [analysis](https://blog.nelhage.com/post/cpython-tail-call/)) | dispatch tweaks are worth a few percent, like this report's ablations |

Code generators, if a JIT were ever built: sljit (x86, ARM v5/v7/Thumb-2, ARM64, MIPS, PPC, RISC-V, s390x, LoongArch; no register
allocator; PCRE2's JIT; ARMv6 not listed; [sljit](https://github.com/zherczeg/sljit)); MIR (x86-64, aarch64, ppc64le, s390x, riscv64;
~91% of gcc -O2, compiles 80-109x faster; 557 KB; [MIR](https://github.com/vnmakarov/mir)); DynASM (x86, x64, ARM, ARM64, MIPS, PPC;
[LuaJIT](https://github.com/LuaJIT/LuaJIT/tree/v2.1/dynasm)); asmjit (x86, AArch64; [asmjit](https://asmjit.com/)); Cranelift (x86-64,
aarch64, s390x, riscv64; [cranelift](https://github.com/bytecodealliance/wasmtime/tree/main/cranelift)). None covers every Zinc target
(ARMv6 Pi 1 and MIPS PSP are the gaps); C covers all of them.

Executable memory by target [W]:

| Target | JIT possible? |
|---|---|
| Linux desktop, Raspberry Pi OS | yes (SELinux `deny_execmem` off by default; PaX MPROTECT kernels need a per-binary exemption) ([SELinux](https://ato-pathways.com/catalogs/xccdf/benchmarks/ssg-ol7-ds.xml:latest/items/xccdf_org.ssgproject.content_rule_sebool_deny_execmem), [PaX](https://bugs.openjdk.org/browse/JDK-8133966)) |
| macOS | yes, but under the hardened runtime (required for notarized distribution) only with the entitlement `com.apple.security.cs.allow-jit`, one `MAP_JIT` region, writes through `pthread_jit_write_with_callback_np`, `sys_icache_invalidate` ([Apple](https://developer.apple.com/tutorials/data/documentation/apple-silicon/porting-just-in-time-compilers-to-apple-silicon.json)); every Zinc export (D27 signs apps) would have to carry the entitlement |
| iOS (iPhone 4S on iOS 9 included) | no: JIT is reserved to alternative browser engines (EU, BrowserEngineKit) ([Apple](https://developer.apple.com/support/alternative-browser-engines/)); iOS 26's TXM also broke the debugger-attach tricks ([UTM 4.7](https://newreleases.io/project/github/utmapp/UTM/release/v4.7.0)); see also `docs/reports/ios-core-runtime.md` |
| Android | yes (`execmem` granted to apps) ([sepolicy](https://android.googlesource.com/platform/system/sepolicy/+/refs/heads/main/private/app.te)) |
| Retail consoles | no (V8's reason for jitless) |
| PSP homebrew | dynarecs exist (gpSP, DaedalusX64) ([gpSP](https://www.gamebrew.org/index.php?title=GpSP)) |
| Vita homebrew | dynarec possible under HENkaku ([HENkaku](https://yifan.lu/2016/08/27/henkaku-update)) |
| 3DS homebrew | only through `svcControlProcessMemory` with Luma3DS ([3dbrew](https://www.3dbrew.org/wiki/Memory_Management)) |
| ESP32 | native code in IRAM (MicroPython's native emitters, ~2x bytecode) ([MicroPython](https://docs.micropython.org/en/latest/reference/speed_python.html)); QuickJS is not linked into firmware anyway (`zinc-next-quickjs.md`) |


### 4.2 What a JIT would buy Zinc

- **Baseline (copy-and-patch or template) JIT**: L1/L1.5 speed (5-7x numeric, 1.5-3x library code [I]), with code produced at run time.
  For Zinc this is the AOT of 3.3 minus the C compile latency, and it only matters for code that cannot be compiled ahead: `eval`,
  downloaded or user-typed scripts. Games and apps ship their JavaScript; `zinc run` already compiles and caches (D43).
- **Optimizing JIT** (type feedback, speculation, deoptimization, register allocation): the L2 level (50-90x on numeric code, 8-36x on
  V8's numbers for whole workloads). Person-years of work and a large attack surface; if that level is needed on desktop, ZN-586's
  route (JavaScriptCore or V8 as an optional desktop engine) is cheaper than building one.
- **Targets**: executable memory is available on Linux desktop and Pi and on macOS with the hardened-runtime entitlement, not on
  iOS 9 or retail consoles, and only through homebrew tricks on PSP, Vita and 3DS (4.1). The AOT path covers all of them.
- **Fit with D13/D36**: D36 rejected a ZBC JIT because AOT already gives a typed program the JIT's upper bound. For JavaScript
  libraries typed AOT does not apply, but C AOT of QuickJS bytecode does: the same conclusion (no JIT) holds, with 3.3 as the route.

---

## 5. The native <-> QuickJS boundary

### 5.1 Today's costs [M] (`js/boundary.js`, ns per call over the empty loop, two runs)

The harness's fake `GL` object copies `libzn_webgl`'s shapes: a native class, ~600 constants and the methods on the prototype, a magic
thunk with a table lookup and an owner check (`callThunk`), uniform locations as opaque objects.

| Call | ns |
|---|---:|
| method lookup only (`f = gl.nop`; `gl.CONST_300` on a 600-property prototype) | 16-17 |
| `gl.nop()` through the thunk / registered directly | 22 / 21 |
| `gl.bind(7)` (one `JS_ToUint32`) thunk / direct | 29 / 27-28 |
| `gl.uniform4f(loc, 4 doubles)` thunk (today's shape) / direct | 46-48 / 45 |
| 4 doubles, no location object, direct | 39-40 |
| **`uniform4fv(loc, Float32Array)` today** (`bytesOf`: `JS_GetArrayBuffer` throws, exception fetched and freed; `floatsOf` copies into a `std::vector`) | **1,359-1,365** |
| the same 20 JS frames deeper | 2,229-2,288 |
| the same with an `ArrayBuffer` (no throw) | 52-53 |
| `uniform4fv`, public non-throwing tests (`JS_IsArrayBuffer`, `JS_GetTypedArrayType`, then `JS_GetTypedArrayBuffer` + `JS_GetArrayBuffer`) | 39-43 |
| `uniform4fv`, borrowed pointer (`JS_GetTypedArrayData`, patch) | 33-36 |
| `uniformMatrix4fv`-like (16 floats) today | 1,402-1,413 |
| throw and discard a TypeError: depth 1 / 20 frames deeper | 1,339-1,482 / 2,183-2,270 |
| string argument (`JS_ToCStringLen`, 15 ASCII chars) / plus a `std::string` copy | 32-33 / 37-41 |
| return a double | 30-32 |
| return `{x,y,z}`: `JS_NewObject` + 3 `JS_SetPropertyStr` / `JS_NewObjectFrom` with cached atoms | 176-185 / 153-161 |
| write 3 floats into a shared `Float32Array`, JS reads them back | 70-87 |
| `__host_*`-style thunk with two `std::vector` reserves (`qjs.cpp:85`) / with stack arrays | 139-156 / 33-35 |
| `JS_CFUNC_f_f_f` (typed, upstream) / generic + 2 `JS_ToFloat64` | 34-37 / 35-51 |
| native -> JS: `JS_Call` of a 1-argument function | 14 |

Reading:

- **The exception defect is the only large cost** (D5 of the games report, ZN-567): 40x on typed-array arguments, and worse in deep
  library stacks because QuickJS builds a backtrace for every Error. three.js uploads two matrices per mesh through `uniformMatrix4fv`
  with a `Float32Array` (`WebGLUniforms` `setValueM4` copies into `mat4array`), so it pays ~2.7 us per mesh today, about 9% of the
  31 us per mesh of the Pi report's frame.
- **D11** (two vectors reserved per `__host_*` call) costs ~110 ns per call: 4x the call itself.
- Everything else is 20-50 ns: the method lookup (~10-15 ns, a prototype hash probe), the call machinery (~10 ns: `JS_CallInternal`,
  `js_call_c_function`, a stack frame), and 2-3 ns per converted argument. Result objects cost 150-185 ns: return numbers or write into a
  shared buffer.

### 5.2 Typed fast calls [M]

Patch `QJS_FASTCALL` (`patch.py`): a new prototype kind `JS_CFUNC_fast` whose descriptor names a typed C function and the class of
`this`; `OP_call_method` recognizes it and, when every argument has the expected tag (int or double; a typed array or ArrayBuffer for
a pointer argument), calls the C function directly with unboxed arguments and the opaque pointer, skipping `JS_CallInternal`,
`js_call_c_function`, the stack frame and the conversion calls; any mismatch takes the generic function (which `js_call_c_function`
also calls when the function is reached by `call`/`apply`). Rules, as in V8's Fast API: the fast function may not allocate JS
objects, throw or call back into JS.

| Call | generic | fast | gain |
|---|---:|---:|---:|
| 4 doubles | 39-40 | 28 | -30% |
| 1 int | 27-28 | 21 | -24% |
| int + Float32Array (borrowed pointer) | 32-34 | 25-26 | -23% |

Zinc can generate these: the runtime table already describes every host row with signature letters (`d`, `i`, `u`, `b`, `s`, `D`,
`B`), and WebGL entry points are a fixed list (of the 160 one-line methods of `webgl_js.cpp`, 69 take only numbers; 65 take a GL
object, a buffer or a string and need two more argument kinds: an opaque object of a given class or null, and a borrowed buffer). The
extra check in `OP_call_method` (a tag and a class compare) was within noise on the workloads. The gain per call is 7-11 ns; it matters for chatty APIs (immediate-mode 2D, p5 with 12
GL calls per box, `zinc:gfx` from JS), not for three.js (3 calls per mesh).

### 5.3 Batching and shared memory [M]

| Pattern | ns per `uniform4f`-sized command |
|---|---:|
| direct call | 45 |
| record `[op, loc, a, b, c, d]` in a `Float64Array`, flush every 256 | 304-426 |
| record in an `Int32Array` + `Float32Array` pair, flush every 512 | 298-313 |

Chrome does not batch in JavaScript either: every WebGL call is one binding call into Blink's C++ (`drawArrays` and `drawElements` as V8
fast calls), and the command buffer is written by C++ to cross into the sandboxed GPU process, because "a separate IPC for each OpenGL ES
2.0 function would arguably be too slow" ([command buffer](https://www.chromium.org/developers/design-documents/gpu-command-buffer/),
[NoAllocDirectCall](https://chromium.googlesource.com/chromium/src/third_party/+/40386b1d5bd8b857e9dabc0b677a95f5cde41b53)). On QuickJS
the arithmetic of a JS-side buffer is worse still: an interpreted typed-array store costs 40-50 ns (2.4), about a whole native call. **Do not build JS-side command buffers for QuickJS.** Batching pays only where the batch is built natively: a native
sprite batcher (ZN-582), instancing (ZN-539), native culling (ZN-543), physics (ZN-583).

Shared memory works and is cheap to set up: an external `ArrayBuffer` over native memory (`JS_NewArrayBuffer` with a host pointer and
no free function) gives JS a zero-copy view, and native code reads JS-written typed arrays in place (borrowed pointer, 33-36 ns per
call). It is the right channel for bulk data (vertex data, transforms, audio, pixels); per-element access from JS still costs 29/42 ns
per read/write, so it does not make fine-grained exchange cheap.

### 5.4 The cheapest binding layer for Zinc, in order

1. **No exceptions as type tests, no per-call heap allocation** (ZN-567): `JS_IsArrayBuffer` / `JS_GetTypedArrayType` or a borrowed
   accessor; stack arrays in `hostFn`; pass pointers instead of copying floats into `std::vector`; atoms created once. -97% on typed
   arrays, -75% on host rows.
2. **Typed fast calls** generated from signatures (QJS-03): -25 to -30% on the remaining calls, upstreamable.
3. **Coarse-grained native APIs instead of per-call tuning**: accelerators for library hot spots (5.5), native batchers and engines.
4. **Bulk data through shared typed arrays**, never through JSON or object graphs; results as numbers or written into a shared buffer.
5. **Native -> JS**: `JS_Call` costs 14 ns plus the callee; reuse event objects instead of building one per event (150-185 ns).

### 5.5 Native accelerators [M]

`Matrix4.prototype.multiplyMatrices` of three r186 replaced by a C function that finds `elements` on `this`, `a` and `b` (plain data
property), checks they are fast Arrays of 16 numbers, reads them, multiplies in three's column order and writes doubles back in place;
anything else calls the original JS method. Compiled with `-ffp-contract=off`, the results are bit-identical to three's JS (with
contraction allowed, clang fuses multiply-adds and the last bits differ). Per call 1.61 -> 0.084 us (19x); the three workload
7.9 -> 6.0 ms per frame (-24%, three runs each) from this one method. The same mechanism for the eight methods of 2.4 should halve
the CPU side of a three.js frame on QuickJS [I], with three.js unchanged. ZN-543 plans this for the Pi tier (r162, tolerance 1e-5);
the measurement says bit-identical is achievable, and that the mechanism belongs to every tier (QJS-04). It needs a borrowed fast-array
accessor in the QuickJS API (QJS-03); the prototype used the engine's internals.

---

## 6. What other runtimes do [W]

| Runtime | Code on iOS and consoles | Native boundary | What Zinc takes from it |
|---|---|---|---|
| Flutter / Dart | JIT in debug, AOT in profile and release; JIT release mode is not supported on iOS and JIT apps cannot ship on the App Store ([engine docs](https://flutter.googlesource.com/mirrors/engine/+/HEAD/docs/JIT-Release-Modes.md)) | `dart:ffi` leaf call 28 ns vs 235 ns non-leaf (leaf calls may not touch the Dart heap and block GC) ([performance.md](https://dart.googlesource.com/native/+/HEAD/doc/performance.md)); `Canvas.drawRect` is one FFI call that only records into a display list replayed on the raster thread ([canvas.cc](https://github.com/flutter/flutter/blob/master/engine/src/flutter/lib/ui/painting/canvas.cc)) | the model Zinc already has for typed code (interpreter for dev, AOT for release, D43); leaf calls = the fast-call contract of 5.2; recording happens natively, not in the script |
| React Native (Hermes, JSI) | Hermes: bytecode precompiled at build time, no JIT by design ("JITs have trouble improving TTI") ([Hermes](https://engineering.fb.com/2019/07/12/android/hermes/)); Hermes V1 default since 0.84, no native compilation yet ([RN 0.84](https://reactnative.dev/blog/2026/02/11/react-native-0.84)) | JSI host objects without serialization ([why](https://reactnative.dev/docs/0.70/the-new-architecture/why)); per call: Expo modules ~4.3 us, TurboModules ~1.16 us, Nitro (bindings generated from TS specs) ~73 ns ([Nitro](https://nitro.margelo.com/docs/comparison)) | bytecode precompilation (ZN-575/ZN-445); generated typed bindings are the fast path: QuickJS's 20-45 ns per call is already in Nitro's class, Zinc's runtime table generates them |
| Haxe / HashLink | HL/JIT on x86/x86-64 only (arm64 JIT still an open PR); HL/C compiles the same bytecode to C, "best performance", same runtime ([HashLink](https://hashlink.haxe.org/), [PR 895](https://github.com/HaxeFoundation/hashlink/pull/895)); Shiro Games ships its console ports (PlayStation, Xbox, Switch; Northgard) through HL/C ([Shiro stack](https://haxe.org/blog/shirogames-stack/)) | C calls compiled in | **bytecode -> C for consoles is a production path**: the model of QJS-06 |
| Godot / GDScript | no JIT, "as JIT is not allowed on iOS" ([proposal 5217](https://github.com/godotengine/godot-proposals/issues/5217)); speed from typed instructions: operators +25-50%, native calls with pre-validated arguments +120-150% ([typed instructions](https://godotengine.org/article/gdscript-progress-report-typed-instructions)); C# through NativeAOT on iOS ([Godot 4.2](https://godotengine.org/article/platform-state-in-csharp-for-godot-4-2/)) | GDExtension: `call` (Variant array), validated call, `ptrcall` (raw typed pointers) ([gdextension_interface.h](https://github.com/godotengine/godot/blob/4.5-stable/core/extension/gdextension_interface.h)) | an interpreter stays fast enough when the boundary has a typed path (`ptrcall` = `JS_CFUNC_fast`) and heavy work lives in native engine code; for JS, without static types, accelerators play the role of typed instructions |
| Unity | Mono JIT on desktop and Android; IL2CPP (IL -> C++) "required for iOS and most consoles" ([backends](https://docs.unity3d.com/Manual/scripting-backends-intro.html)); Burst compiles hot numeric jobs (35% less time than IL2CPP in one test, [article](https://www.jacksondunstan.com/articles/5211)) | P/Invoke, native plugins | VM bytecode -> C++ for locked platforms plus a specialized compiler for hot kernels: QJS-06 plus accelerators |
| LuaJIT | JIT where allowed, interpreter elsewhere | FFI calls are inlined only in JIT-compiled code; "callbacks are slow" ([FFI semantics](https://luajit.org/ext_ffi_semantics.html)); Lua C API ~5-11 ns per call ([sol2](https://sol2.readthedocs.io/en/latest/performance.html)) | a cheap FFI comes from the compiler; in an interpreter keep calls coarse |
| Browser engines | V8 jitless on locked platforms (4.1) | V8 Fast API: typed callbacks called from optimized code, no JS heap allocation, no JS execution, no throw ([v8-fast-api-calls.h](https://chromium.googlesource.com/v8/v8.git/+/main/include/v8-fast-api-calls.h)); typed-array arguments were removed again and are "to be supported" ([13.4 header](https://chromium.googlesource.com/v8/v8.git/+/refs/heads/13.4-lkgr/include/v8-fast-api-calls.h)); Node's `URL.canParse` +17.6-29.6% ([PR 47552](https://github.com/nodejs/node/pull/47552)); JSC DOMJIT +40% on a DOM getter ([bug 162544](https://bugs.webkit.org/show_bug.cgi?id=162544)); SpiderMonkey `JSJitInfo` descriptors ([JitInfo.h](https://searchfox.org/firefox-main/source/js/public/experimental/JitInfo.h)) | the contract of QJS-03's fast functions; Zinc can also take typed arrays as borrowed pointers because QuickJS does not move memory |

Two more data points: Canvas `drawImage` batching was proposed because binding overhead limits hundreds to thousands of calls per frame
([WHATWG wiki](https://wiki.whatwg.org/wiki/Canvas_Batch_drawImage)), and LOVE batches draws natively, flushing on state changes
([love2d](https://www.love2d.org/wiki/love.graphics.flushBatch)): both batch below the script, as 5.3 recommends. External ArrayBuffers
are forbidden in V8's memory cage (Electron 21+, [Electron](https://electronjs.org/blog/v8-memory-cage)); QuickJS has no such restriction,
so zero-copy views on native memory stay available to Zinc.


---

## 7. Engine improvements: upstream or fork

Upstream context [W]: quickjs-ng releases about every two months (0.17.0 on 2026-09-18,
[releases](https://github.com/quickjs-ng/quickjs/releases)); it ports Bellard's speed work (the small-block arena allocator, bench-v8
1,511 -> 1,783 with it, [#1551](https://github.com/quickjs-ng/quickjs/pull/1551); mixed int/float arithmetic and fast arrays, +6%
Octane, [#1549](https://github.com/quickjs-ng/quickjs/pull/1549)). Its maintainers consider a JIT "forever out of scope"
([#272](https://github.com/quickjs-ng/quickjs/issues/272)), sent a bytecode-to-C proposal to "a fork"
([#1393](https://github.com/quickjs-ng/quickjs/issues/1393)) and removed inline caches (section 1). Bellard's QuickJS gained 42% on
bench-v8 in the 2026-06-04 release (small-block allocator 11%, micro-optimizations 30%) and later inlined `get_field`/`put_field`,
equality and relational operators and a fused `set_loc_check`; it rejects a JIT as contrary to "small code, reasonably simple and
portable" ([Changelog](https://github.com/bellard/quickjs/blob/master/Changelog), [#37](https://github.com/bellard/quickjs/issues/37)).
Independent v8-v7 runs (javascript-zoo, amd64, 2026-05): V8 jitless 2,674, Hermes 2,433, JSC jitless 1,697, QuickJS 1,163, quickjs-ng
0.15 910 (before the arena port), V8 with JIT 47,755 ([javascript-zoo-data](https://github.com/ivankra/javascript-zoo-data)): the
interpreters with inline caches and register bytecode (V8, Hermes) are about 2x QuickJS, as measured in 2.1.

| Improvement | Upstream status | Gain (measured here or reported) | Verdict for Zinc |
|---|---|---|---|
| Small-block arena allocator | in quickjs-ng 0.17 | +18% bench-v8 [W]; mimalloc on top: noise [M] | done (keep the system allocator) |
| Mixed int/float arithmetic, fast arrays | in 0.17 | +6% Octane [W] | done |
| Number fast paths in `<`, `===`; typed-array stores | Bellard inlined the comparisons (2026-06); not in ng 0.17 | -2 to +3% on the four workloads [M] | take with the next quickjs-ng release; no patch |
| TDZ (`let`/`const`) checks | Bellard's `set_loc_check` (2025-12), not ported | `var` rewrite: -2 to +2% [M] | no patch |
| Tail-call (`musttail`) dispatch | Bellard measured +3.5% (x86), "will merge"; quickjs-aot +8.5% | [W] | take from upstream |
| **Typed fast C calls** | nothing upstream (only `JS_NewCFunction3`, `JS_NewCFunctionData2`); `JS_CFUNC_f_f` is the precedent | -24 to -30% per call [M] | **patch + upstream PR** (QJS-03) |
| **Borrowed typed-array and fast-array accessors** | ng has `JS_GetUint8Array` (2023), `JS_IsArrayBuffer` (2024-02), `JS_GetTypedArrayType` (2024-12): enough for D5 | 39-43 -> 33-36 ns [M]; accelerators need the fast-array one | **patch + upstream PR** (QJS-03) |
| Inline caches | removed from ng (2025-02): 1.037x average, regressions on run-once code; monomorphic read IC closed (2026-05) | L1 -> L1.5 1.27x on the sprite loop [M]; prettier 1.54x [W] | only in the AOT (QJS-06), or in the interpreter with a per-function warm-up so run-once code pays nothing (QJS-07, if the AOT is a no-go) |
| Register bytecode / template interpreter | PrimJS (arm64 assembly) | +28% Octane [W]; register VMs ~32% less time [W] | no: a compiler rewrite, one backend per architecture |
| 64-bit NaN-boxing (8-byte values) | no proposal | halves value memory and stack traffic on 64-bit; unmeasured | defer: 32-bit targets already have it; touches every value access |
| Incremental or generational cycle collector | no work in ng (heuristics only); PrimJS mark-sweep (arm64); mquickjs tracing compacting GC | pauses: p99 11.8 ms at 100k live objects [games report] | schedule the existing collector (ZN-575); a new GC is a new engine |
| Smaller `JS_CallInternal` frames | Frida: 608 -> 448 bytes on arm64 ([frida/quickjs](https://github.com/frida/quickjs/commits/main)) | deep library stacks on PSP/Vita/3DS stacks | worth porting for the handhelds if stack overflows show up |
| Bytecode cache | API exists (`JS_WriteObject`, strip flags) | three.core.js 22.8 -> 1.6 ms [M] | ZN-575, ZN-445 |
| JIT | out of scope upstream; sljit PR +4.7%; Longbridge Cranelift JIT (Rust) | section 4 | no |

Fork policy: a **patch queue**, not a hard fork (QJS-02). quickjs-ng moves fast (seven releases in twelve months) and fixes
conformance bugs Zinc wants; a hard fork would freeze them. Each patch is small, measured and proposed upstream; the only large
divergence would be the AOT generator (QJS-06), which by design lives outside `quickjs.c` (generated code plus an extracted header of
opcode bodies) and needs only a hook in `JS_CallInternal` to call a compiled body.

---

## 8. Plan

Ordered by gain for effort; every item works on every target (no executable memory).

| # | Work | Task | Measured or expected gain | Size |
|---|---|---|---|---|
| 1 | Binding defects: no exceptions as type tests, stack arrays in `hostFn`, no float copies; draw validation caches | ZN-567 (exists) | typed-array calls 1,360 -> 33-43 ns; host rows 139-156 -> 33-35 ns; ~2.7 us per three.js mesh | M |
| 2 | Bytecode cache, stripped in exports, line tables in development | ZN-575, ZN-445 (exist) | three.core.js 22.8 -> 1.6 ms; Phaser/Babylon start-up | M |
| 3 | Patch queue on pristine quickjs-ng, test262 subset on the patched engine | QJS-02 | prerequisite | S |
| 4 | Typed fast calls + borrowed typed-array / fast-array accessors, generated for host rows and WebGL; upstream PR | QJS-03 | -25 to -30% per call (69 WebGL methods are numeric-only) | M |
| 5 | Bit-identical native accelerators for library hot methods (three math first), JS fallback | QJS-04 (ZN-543 builds on it) | one method: -24% of the three frame; eight: about -50% [I] | M |
| 6 | Binding rules and a boundary benchmark with a regression gate | QJS-08 | keeps 1 and 4 from regressing | S |
| 7 | Hot-function profiler for QuickJS (`zinc profile`) | QJS-05 | selects 5 and 8 | M |
| 8 | Spike: QuickJS bytecode -> C AOT with inline caches, hot functions only; gate >= 2x on three and matter-js frames, code <= 15x bytecode, test262 identical | QJS-06 | 5.9-7.4x numeric, 4.9x on a three.js method (measured by proxy); 1.5-3x on frames [I] | L |
| 9 | Inline caches in the interpreter, only if 8 is a no-go | QJS-07 | bounded by V8 jitless: <= 1.7-2.7x for all interpreter work together [M]; ICs alone 1.2-1.3x [I] | L |

Not planned: a QuickJS JIT of any kind (section 4); 64-bit NaN-boxing (the 32-bit targets already have it; on 64-bit a refactor of
every value access for an unmeasured gain); a register-based bytecode or new interpreter (a rewrite of QuickJS's compiler, outside what
upstream would take); typed AOT of npm libraries (3.4). Native engines for whole domains stay where they are planned: sprite batcher
ZN-582, physics ZN-583, instancing ZN-539, `zinc:gl` ZN-562 for the native tier. A JIT engine on desktop stays ZN-586's spike.

What it adds up to for three.js [I]: today ~16 us of JavaScript per mesh on the M1 (about 340 us on a Pi 3B+ by the Pi report's
scaling). Items 1 and 5 remove the exception cost and about half the math: ~8 us (M1), ~170 us (Pi 3B+). Item 8, if its gate passes,
divides what remains by 1.5-3: ~3-5 us (M1), ~60-110 us (Pi 3B+), that is two to four times more meshes per frame than today. Getting to
V8-class numbers stays out of reach without speculation (L2), which needs a JIT or the native tier.

---

## 9. Proposed decision (row for docs/reports/zinc-next-decisions.md)

| D44 | QuickJS speed: AOT, JIT and the native boundary (QJS-01; `docs/reports/quickjs-aot-jit-and-ffi.md`) | **No QuickJS JIT. Fix the boundary and accelerate library hot spots now; QuickJS bytecode -> C AOT only through a gated spike.** Measured on the M1 Pro: QuickJS spends 2.9-4.8 ns per bytecode, 85-97% of samples in the interpreter loop, and per-opcode fast paths change workloads by 0-5%; V8 jitless is 1.7-2.7x faster (the ceiling of interpreter work), V8's JIT 8-36x. A hand-made bytecode -> C translation of the sprite loop is 5.9x faster (7.4x with inline caches), of three.js's `Matrix4.multiplyMatrices` 4.9x, bit-identical with `-ffp-contract=off`; speculative code 85x. The boundary costs 20-45 ns per call except typed arrays (1,360 ns: an exception used as a type test, ZN-567) and the host thunk (139-156 ns: two vectors); a typed fast-call path saves another 25-30%; JS-side command buffers cost 300-430 ns per command and are rejected; one native accelerator cuts the three.js frame by 24%. Options scored (gain x3, targets incl. iOS/consoles x2, effort x2, risk and maintenance x2, upstreamability x1; 1-5): (a) boundary fixes, typed fast calls, accelerators, bytecode cache: 2,5,5,5,4 = 40; (f) a JIT engine (JSC/V8) on desktop, ZN-586: 5,1,3,3,3 = 32; (b) bytecode -> C AOT with ICs: 3,5,2,3,2 = 31; (e) interpreter work in a fork (ICs, register VM, 64-bit NaN-boxing; upstream removed its ICs in 2025): 2,5,2,3,3 = 29; (d) optimizing JIT for QuickJS: 5,2,1,1,1 = 24; (g) Zinc's typed AOT for npm libraries: 1,5,1,2,3 = 22; (c) copy-and-patch baseline JIT: 3,2,1,2,1 = 20. Do (a) now (ZN-567, QJS-02/03/04/05/08, ZN-575), (b) as the spike QJS-06 (the only option that raises the ceiling on every target, iOS and consoles included) with a gate (>= 2x on the three.js and matter-js frames, code <= 15x the bytecode, test262 identical), (e) only as upstream proposals (QJS-07 if (b) is a no-go), (f) stays ZN-586; reject (c), (d), (g). Engine changes live in a patch queue on pristine quickjs-ng, each proposed upstream. | The interpreter, not the binding, is the compatibility tier's ceiling; native code is the only large lever, and only AOT native code runs on every Zinc target (iOS 9 and consoles forbid executable memory); Zinc already ships the C toolchain and a compile-and-cache run model (D43). Consistent with D13/D36: JS libraries cannot use the typed AOT, but their bytecode can be compiled to C. | QJS-06 below 1.5x on library frames (then QJS-07 and the native tier carry the load); a product that must run downloaded JavaScript fast on desktop (then ZN-586); quickjs-ng merging inline caches or a fast-call API upstream (then drop the patch). |

---

## 10. Sources

Zinc [C]: `next/src/qjs/qjs.cpp`, `next/src/qjs/ext.cpp`, `next/src/gl/webgl_js.cpp`, `next/third_party/quickjs-ng/` (0.17.0:
`quickjs.c`, `quickjs.h`, `quickjs-opcode.h`), `next/CMakeLists.txt`, `compiler/src/infer.ts`, `docs/decisions/0014-dyn.md`,
`docs/reports/zinc-next-decisions.md` (D3, D13, D14, D22, D27, D36, D40, D43), `docs/reports/games/js-game-libraries.md`,
`docs/reports/hardware/raspberry-pi-threejs-and-sdk.md`, `docs/reports/hardware/handhelds-psp-vita-3ds-iphone4s.md`,
`docs/reports/hardware/pocketjs-pocket3d.md`, `docs/reports/ios-core-runtime.md`, `docs/reports/zinc-next-quickjs.md`,
`docs/reports/zinc-next-m4-benchmarks.md`, `docs/reports/parity/01-language-cli-std.md`; backlog ZN-445, ZN-539, ZN-543, ZN-562,
ZN-567, ZN-575, ZN-582, ZN-583, ZN-586.

Measurements [M]: `/Users/mowmow/.claude/jobs/f633d587/tmp/qjs-analysis/` (README.txt).

QuickJS and forks [W]:
- quickjs-ng: [releases](https://github.com/quickjs-ng/quickjs/releases), [docs: differences](https://quickjs-ng.github.io/quickjs/diff) (read through Context7; its IC line is stale),
  [diff.md](https://github.com/quickjs-ng/quickjs/blob/master/docs/docs/diff.md), [commits of quickjs.h](https://github.com/quickjs-ng/quickjs/commits/master/quickjs.h),
  ICs [#120](https://github.com/quickjs-ng/quickjs/pull/120), [#551](https://github.com/quickjs-ng/quickjs/pull/551), [#876](https://github.com/quickjs-ng/quickjs/issues/876),
  [#884](https://github.com/quickjs-ng/quickjs/pull/884), [#1521](https://github.com/quickjs-ng/quickjs/pull/1521); JIT [#272](https://github.com/quickjs-ng/quickjs/issues/272),
  [#659](https://github.com/quickjs-ng/quickjs/issues/659), [#1332](https://github.com/quickjs-ng/quickjs/pull/1332); AOT [#1393](https://github.com/quickjs-ng/quickjs/issues/1393);
  arena [#1551](https://github.com/quickjs-ng/quickjs/pull/1551), mimalloc [#1545](https://github.com/quickjs-ng/quickjs/pull/1545), Bellard ports [#1549](https://github.com/quickjs-ng/quickjs/pull/1549),
  GCC 14 [#1744](https://github.com/quickjs-ng/quickjs/pull/1744), GC heuristics [#1806](https://github.com/quickjs-ng/quickjs/pull/1806), C function API
  [#877](https://github.com/quickjs-ng/quickjs/pull/877), [#1195](https://github.com/quickjs-ng/quickjs/pull/1195), small strings [#907](https://github.com/quickjs-ng/quickjs/issues/907),
  benchmarks [#918](https://github.com/quickjs-ng/quickjs/issues/918), [#1172](https://github.com/quickjs-ng/quickjs/issues/1172).
- Bellard: [QuickJS](https://bellard.org/quickjs/), [Changelog](https://github.com/bellard/quickjs/blob/master/Changelog), [commits](https://github.com/bellard/quickjs/commits/master),
  [allocator](https://github.com/bellard/quickjs/commit/99e9181d), [JIT stance #37](https://github.com/bellard/quickjs/issues/37), [tail calls #466](https://github.com/bellard/quickjs/issues/466),
  [quickjs.texi](https://github.com/bellard/quickjs/blob/master/doc/quickjs.texi), [mquickjs](https://github.com/bellard/mquickjs),
  [2019 benchmark (archived)](https://web.archive.org/web/20250827063258/https://bellard.org/quickjs/bench.html).
- [PrimJS benchmark](https://github.com/lynx-family/primjs/blob/develop/docs/benchmark.md), [template interpreter](https://github.com/lynx-family/primjs/blob/develop/docs/template_interpreter.md),
  [GC](https://github.com/lynx-family/primjs/blob/develop/docs/gc.md); [OpenQuickJS](https://github.com/OpenQuickJS/quickjs); [Frida QuickJS](https://github.com/frida/quickjs/commits/main);
  [quickjs-aot](https://github.com/ivankra/quickjs-aot); [quickjit](https://github.com/bnoordhuis/quickjit); [quickjs-jit](https://docs.rs/crate/quickjs-jit/latest),
  [rquickjs](https://github.com/longbridge/rquickjs); [JWST](https://w3.org/2023/Talks/TPAC/ac-lt-js-wasm); [LLRT](https://github.com/awslabs/llrt); [Javy](https://github.com/bytecodealliance/javy),
  [Igalia 2026-05](https://blogs.igalia.com/compilers/2026/05/25/five-years-of-javascript-on-webassembly/); [txiki.js](https://github.com/saghul/txiki.js);
  [javascript-zoo-data](https://github.com/ivankra/javascript-zoo-data).

JIT, AOT and interpreters [W]: [V8 Sparkplug](https://v8.dev/blog/sparkplug), [Maglev](https://v8.dev/blog/maglev), [jitless](https://v8.dev/blog/jitless),
[holiday 2023](https://v8.dev/blog/holiday-season-2023); [SpiderMonkey PBL](https://cfallin.org/blog/2023/10/11/spidermonkey-pbl/), [AOT JS](https://cfallin.org/blog/2024/08/27/aot-js/),
[weval PLDI 2025](https://cfallin.org/pubs/pldi2025_weval.pdf); [PEP 744](https://peps.python.org/pep-0744/), [PEP 836](https://peps.python.org/pep-0836/),
[JIT on track](https://blog.python.org/2026/03/jit-on-track/), [Steering Council](https://discuss.python.org/t/an-announcement-from-the-steering-council-regarding-the-jit-project/107638);
[copy-and-patch](https://arxiv.org/pdf/2011.13127), [Deegen](https://arxiv.org/html/2411.11469v2); Static Hermes [2023](https://speakerdeck.com/tmikov2023/static-hermes-react-native-eu-2023-announcement),
[2024](https://speakerdeck.com/tmikov2023/optimizing-with-static-hermes-chain-react-2024); [Porffor](https://porffor.dev/), [repo](https://github.com/CanadaHonk/porffor);
[sljit](https://github.com/zherczeg/sljit), [PCRE2 JIT](https://www.pcre.org/current/doc/html/pcre2jit.html), [MIR](https://github.com/vnmakarov/mir),
[DynASM](https://github.com/LuaJIT/LuaJIT/tree/v2.1/dynasm), [asmjit](https://asmjit.com/), [Cranelift](https://github.com/bytecodealliance/wasmtime/tree/main/cranelift);
[register vs stack VM](https://usenix.org/legacy/events/vee05/full_papers/p153-yunhe.pdf), [superinstructions](https://mural.maynoothuniversity.ie/10189),
[musttail](https://blog.reverberate.org/2021/04/21/musttail-efficient-interpreters.html), [Python 3.14](https://docs.python.org/3.14/whatsnew/3.14.html),
[tail-call analysis](https://blog.nelhage.com/post/cpython-tail-call/), [wasm3](https://github.com/wasm3/wasm3).

Platforms [W]: [Apple JIT porting](https://developer.apple.com/tutorials/data/documentation/apple-silicon/porting-just-in-time-compilers-to-apple-silicon.json),
[alternative browser engines](https://developer.apple.com/support/alternative-browser-engines/), [UTM 4.7](https://newreleases.io/project/github/utmapp/UTM/release/v4.7.0),
[Android sepolicy](https://android.googlesource.com/platform/system/sepolicy/+/refs/heads/main/private/app.te),
[SELinux deny_execmem](https://ato-pathways.com/catalogs/xccdf/benchmarks/ssg-ol7-ds.xml:latest/items/xccdf_org.ssgproject.content_rule_sebool_deny_execmem),
[PaX](https://bugs.openjdk.org/browse/JDK-8133966), [gpSP](https://www.gamebrew.org/index.php?title=GpSP), [DaedalusX64](https://daedalusx64.sourceforge.io),
[HENkaku](https://yifan.lu/2016/08/27/henkaku-update), [3dbrew](https://www.3dbrew.org/wiki/Memory_Management),
[RetroArch 3DS](https://www.libretro.com/index.php/retroarch-3ds-full-speed-ps1-now-possible-with-pcsx-rearmed-w-unai-renderer/),
[MicroPython speed](https://docs.micropython.org/en/latest/reference/speed_python.html).

Boundaries and other runtimes [W]: [V8 8.7](https://v8.dev/blog/v8-release-87), [v8-fast-api-calls.h](https://chromium.googlesource.com/v8/v8.git/+/main/include/v8-fast-api-calls.h),
[Node fast API guide](https://github.com/nodejs/node/blob/main/doc/contributing/adding-v8-fast-api.md), [Node PR 47552](https://github.com/nodejs/node/pull/47552),
[Chromium WebGL fast calls](https://chromium.googlesource.com/chromium/src/third_party/+/40386b1d5bd8b857e9dabc0b677a95f5cde41b53),
[GPU command buffer](https://www.chromium.org/developers/design-documents/gpu-command-buffer/), [DOMJIT](https://bugs.webkit.org/show_bug.cgi?id=162544),
[JitInfo.h](https://searchfox.org/firefox-main/source/js/public/experimental/JitInfo.h); [RN new architecture](https://reactnative.dev/docs/0.70/the-new-architecture/why),
[RN 0.82](https://reactnative.dev/blog/2025/10/08/react-native-0.82), [RN 0.84](https://reactnative.dev/blog/2026/02/11/react-native-0.84),
[Nitro comparison](https://nitro.margelo.com/docs/comparison), [Hermes](https://engineering.fb.com/2019/07/12/android/hermes/),
[Hermes V1](https://swmansion.com/blog/welcoming-the-next-generation-of-hermes-67ab5679e184); [Flutter JIT release modes](https://flutter.googlesource.com/mirrors/engine/+/HEAD/docs/JIT-Release-Modes.md),
[dart:ffi performance](https://dart.googlesource.com/native/+/HEAD/doc/performance.md), [painting.dart](https://github.com/flutter/flutter/blob/master/engine/src/flutter/lib/ui/painting.dart),
[canvas.cc](https://github.com/flutter/flutter/blob/master/engine/src/flutter/lib/ui/painting/canvas.cc); [HashLink](https://hashlink.haxe.org/),
[HashLink arm64 PR](https://github.com/HaxeFoundation/hashlink/pull/895), [Shiro Games stack](https://haxe.org/blog/shirogames-stack/);
[Godot JIT proposal](https://github.com/godotengine/godot-proposals/issues/5217), [typed instructions](https://godotengine.org/article/gdscript-progress-report-typed-instructions),
[typing test 2024](https://www.beep.blog/2024-02-14-gdscript-typing/), [gdextension_interface.h](https://github.com/godotengine/godot/blob/4.5-stable/core/extension/gdextension_interface.h),
[C# on Godot 4.2](https://godotengine.org/article/platform-state-in-csharp-for-godot-4-2/); [Unity backends](https://docs.unity3d.com/Manual/scripting-backends-intro.html),
[Burst](https://docs.unity3d.com/Manual/script-compilation-burst.html), [Burst vs IL2CPP](https://www.jacksondunstan.com/articles/5211);
[LuaJIT FFI](https://luajit.org/ext_ffi.html), [FFI semantics](https://luajit.org/ext_ffi_semantics.html), [sol2 performance](https://sol2.readthedocs.io/en/latest/performance.html);
[Canvas batch drawImage](https://wiki.whatwg.org/wiki/Canvas_Batch_drawImage), [LOVE flushBatch](https://www.love2d.org/wiki/love.graphics.flushBatch),
[V8 memory cage](https://electronjs.org/blog/v8-memory-cage), [napi_no_external_buffers_allowed](https://github.com/nodejs/node/pull/45181).

