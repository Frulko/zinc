# Internal survey: typed Zinc, QuickJS, the web environment and the boundary (2026-10-20)

Read-only survey of the tree at `develop` (8c264f96). Every claim names its source. `D<n>` rows are in `docs/reports/zinc-next-decisions.md` (line given as `L<n>`); `ZN-<n>` task files are in `backlog/tasks/` (a Done task stays in that folder; `backlog/completed` does not exist). Status words are the `status:` field of the task file. Where code, report and task disagree, the disagreement is stated. Items marked "inferred" are not written down in the tree.

## 0. The shape of the system in six sentences

1. A Zinc program is run by one of three engines: the typed interpreter, the typed AOT (C++ through the pinned zig) or QuickJS-ng 0.17.0 (`--engine quickjs`); the typed engines are the default and the fast path (decisions section 3, L21-25).
2. QuickJS is used in two different ways: as a whole-program engine (a `.js` entry, or `"engine": "quickjs"` in zinc.json: `docs/guide/01-getting-started.md:271`) and as an embedded sandbox inside a typed program (`zinc:script`, D22).
3. The two uses share one QuickJS-ng copy in `third_party/quickjs-ng` (patched, section 6), not the plugin's vendored one (D22, L92).
4. A whole-program QuickJS run does not call typed code at all: the typed standard modules (`zinc:gfx`, `zinc:ui`...) are stripped of types and run as JavaScript, and the host is reached through `__host_*` functions generated from the runtime table (`src/qjs/qjs.cpp:55-171`, `docs/reports/zinc-next-quickjs.md` table "How it works").
5. A typed program that embeds `zinc:script` crosses values as JSON-like text (generic path) or as raw numbers (`zinc:script/fast`), at 0.5 to 1 us and 0.057 to 0.142 us per call on the M1 Pro (section 2).
6. The browser environment is a 130 KB JavaScript file, `lib/std/webenv.js`, read at run time and evaluated before the program, plus 223 lines of C++ (`src/qjs/webenv.cpp`), a Canvas 2D backend (`src/qjs/canvas2d.cpp`, 471 lines) and the WebGL binding (`src/gl/webgl_js.cpp`, 1539 lines, module `libzn_webgl`).

## 1. Decisions

Scores in D44 and D110 follow `RULES.md` section 4; the exact weights are in the rows.

| Decision | What was decided | Numbers | Source |
|---|---|---|---|
| Section 3 (ZN-051) | QuickJS is kept as a full second engine behind the same host ABI, for plain JavaScript (npm code, eval, dynamic plugins). Typed engine stays the default. | Interpreter 3 to 6 times faster than QuickJS on numeric kernels (ZN-026). MicroQuickJS (section 6, ZN-043) not adopted: ES5 only, about as fast as QuickJS, 4 to 7 times slower than the Zinc interpreter. | L21-25, L59-62 |
| D1 | Native-module ABI: `include/zn/native.h`, typed export table with signature letters, one `CallNative` opcode, versioning/finalizers from Node-API, own/borrow rules from WIT. | ABI 1.1 (`native.h:ZN_ABI_*`). | L70, `include/zn/native.h:1-35` |
| D13, D36 | No JIT for typed code. Spike ZN-150 (sljit baseline JIT) is a no-go, measured by the upper bound: AOT is the cap of a JIT. D13 adds "JS libraries on QuickJS are a separate question: D44". | AOT over interpreter: fib 3.7x, nbody 4.5x, mandelbrot 3.6x, spectralnorm 11.9x, sort 1.3x, binarytrees 1.9x, strings 1.4x. | L82, L106 |
| D22 (ZN-103) | `zinc:script` runs on the engine's own QuickJS-ng. Native module `QuickJS` (`src/qjs/script_native.cpp`, spec `plugins/script/native/quickjs.spec.ts`). `unknown` crosses as JSON text (generated wrappers `__nativeJson`/`__nativeValue`/`__nativeArgs`); a script function crosses as `{"__zn_fn": n}`, a handle into the Vm's table. Scored one-engine/parity/effort: this 5/4/3 against the plugin's vendored copy 2/5/4. | Lost by JSON: NaN, `undefined` in arrays, cycles. | L92 |
| D40 (ZN-330) | WebGL (`src/gl`, glad, glslang) is the module `libzn_webgl`, loaded on the first QuickJS context. | zinc 13.98 to 11.66 MB; `-DZN_WEBGL=OFF` skips 16 s of build. | L110 |
| D44 (QJS-01, report `docs/reports/quickjs-aot-jit-and-ffi.md`) | No QuickJS JIT. Fix the boundary and accelerate library hot spots now; bytecode-to-C only as a gated spike. Scored (gain x3, targets x2, effort x2, risk x2, upstream x1): (a) boundary fixes, typed fast calls, accelerators, bytecode cache 40; (f) JIT engine JSC/V8 on desktop (ZN-586) 32; (b) bytecode to C with ICs 31; (e) fork with ICs/register VM/NaN-boxing 29; (d) optimizing JIT 24; (g) Zinc typed AOT for npm libs 22; (c) copy-and-patch 20. Engine changes live in a patch queue on pristine quickjs-ng. | QuickJS 2.9-4.8 ns per bytecode, 85-97% of samples in the interpreter loop; V8 jitless 1.7-2.7x faster, V8 JIT 8-36x. Hand bytecode-to-C: sprite loop 5.9x (7.4x with ICs, speculative 85x), three `multiplyMatrices` 4.9x. Boundary 20-45 ns per call except typed arrays 1,360 ns (exception used as type test, ZN-567) and the host thunk 139-156 ns (two vectors). Typed fast calls save 25-30%. JS-side command buffers 300-430 ns per command (rejected). One native accelerator cuts the three.js frame 24% (7.9 to 6.0 ms, 500 meshes). | L114, report sections 0, 2, 3.3 |
| D55 (ZN-599, QJS-06) | No-go on QuickJS bytecode to C by copying the interpreter's opcode bodies (`tools/qjs2c`, patch 0002). Revisit if a product needs 2x or more on library frames on a target without a JIT after accelerators and ICs. | Idle Intel Mac, 30 hottest functions compiled: three.js 500 meshes 7.31 to 5.71 ms (1.28x), sprite 1.40x, objects 1.08x, matter-js 300 bodies 9.42 to 7.32 ms (1.29x). Gate was 2x on three and matter-js; code 53-61x the bytecode (gate 15x). 71-72% of time stays in the compiled bodies. | L125, `docs/reports/zinc-next-qjs2c.md` |
| D56 (ZN-600, QJS-07) | Inline caches in the QuickJS interpreter not adopted; patch kept as `docs/reports/zinc-next-qjs-ic.patch`. Revisit: ZN-600.01 measures on Apple Silicon. | Hit rate 89-99.9%; three.js 0.98-1.00x, sprite 0.97-0.98x, objects 1.01-1.06x, matter-js 0.98-1.02x (gate: 15% on two workloads). | L126 |
| D57 (ZN-562) | `zinc:gl` gives compiled Zinc code WebGL with the same names and argument order, generated from one table (`tools/gen-zinc-gl`); the QuickJS binding is not moved onto it. 243 methods. | Per call (Intel Mac, ns): zinc:gl AOT getError 17, uniform4f 63-66, uniformMatrix4fv 94-104, drawElements 330; QuickJS binding 73-79, 135-167, 376-468 (`docs/reports/zinc-next-perf.md:341`). | L127 |
| D83 (ZN-566, ZN-568) | A thin web environment of our own, `lib/std/webenv.js`, off by default (zinc.json `web`). Scored 67 against the same with proven parsers 64 and a DOM library in JS 43 (linkedom: 411 KB, 19-21 ms, +5.2 MB, lacks rAF, fetch, input events, layout, canvas contexts). Also engine robustness: stack limit follows the thread's stack less 1 MiB capped at 8 MiB (RangeError, depth 6,837), unhandled rejection prints and exits 101. | 67 KB JS at the time (now 130,458 bytes, 1,732 lines: `wc`), +14.5 KB in zinc for the C++ side; context creation 10.2 ms off, 16.7 ms on; first frame 320-420 ms after the context; frame 0.3-0.8 ms on minimal scenes. | L153, `docs/reports/zinc-next-perf.md:592-606` |
| D98, D103 (ZN-570, ZN-571) | Canvas 2D: canvas_ity (ISC) draws everything, our text tier shapes and passes glyph outlines as paths; the full tier stays on canvas_ity, no Skia/ThorVG. | 34-char line into 512x128 in 1.3 ms; 640x480 fill 4-5 ms; SSIM against headless Chrome 0.976-0.989. p5 with 1,000 ellipses at 800x600 takes 30-37 ms a frame with every context method empty: the script is the bound. | L168, L173 |
| D110 (owner 2026-10-12, on js-p5 at 40 fps) | Two routes, both kept. (1) QuickJS stays the engine of every target and the reference; it is made fast in our tree by a compiler of its bytecode, ahead of time (ZN-723: stack and locals as values, borrowed refs, a cache per property site, direct calls, then number types behind guards; hot functions only, cached as D43), with a JIT backend later where memory may be executable. (2) JavaScriptCore as an optional engine behind the same host table and web environment (ZN-586), never required. Libraries do not move to the Zinc VM. Scores: (c) JSC optional 54; (a) bytecode compiler 52; (e) accelerators per library 46; (b) libs on Zinc VM 41; (d) JIT inside QuickJS 41; (f) adopt Longbridge's JIT 41. | js-p5 (144 boxes, 800x500 window, 1600x1000 canvas): 25 ms a frame (40 fps on a 120 Hz display), script 17.2 ms (WebGL calls 1.6), canvas upload 1.2, swap 0.5. 60 fps needs the script 1.3x faster, 120 fps 2.9x. Interpreter loop 57%, QuickJS runtime 43% of the script's samples. p5 makes per frame 6,480 `setUniform`, 3,312 `_arraysEqual`, 1,152 `Matrix.copy`, 4,301 WebGL calls. Ceilings, ms per frame QuickJS / JSC no JIT / V8 jitless / JSC / V8: three 4.97 / 2.34 / 3.09 / 0.204 / 0.271; sprite 8.02 / 3.74 / 8.29 / 0.250 / 0.477; objects 0.747 / 0.598 / 0.463 / 0.118 / 0.100; p5shape 8.45 / 6.05 / 4.75 / 0.31 / 1.71. System JSC embedded runs without JIT (6.16 ms p5shape) unless the executable has `com.apple.security.cs.allow-jit` (0.41 ms; ad hoc signature enough). Longbridge quickjs-jit 0.12.11: 32-45x on numeric kernels, 0.99-1.00x on a realistic panel (refuses 124 of about 255 opcodes). Measured on a loaded M1 Pro, one run each ("to retake alone"). | L180, `docs/reports/zinc-next-perf.md:676-692` |
| D132 (2026-10-16) | `zinc bundle`: the engine's own transform stage, esbuild (pinned through the toolchain manager) only for linking, optional `.qbc` bytecode. | Report `docs/reports/zinc-quickjs-bundler.md`. | L206 |
| D145, D147, D148 (2026-10-17) | The web target runs the app's bundle on the browser's own engine behind a thin JS host (`targets/web/runtime.js`), no ZBC/AOT/wasm for ordinary apps (scored 77 against 54 interpreter in wasm, 50 AOT to wasm, 47 QuickJS in wasm). esbuild is the single resolver for npm packages. A WebGL picture reaches the Zinc surface as a gfx image; real three.js r186 runs on a page-made WebGL2 canvas. | 13 libraries tested in dev and export. | L219, L221, L222 |
| D59, D137 (iOS) | iOS: SDL3 shell, software raster with zero-copy present; no JIT for third parties (`MAP_JIT` reserved to WebKit; JSC in-process runs without JIT). | `docs/reports/ios-core-runtime.md:40,59` ("Embedded QuickJS/Hermes/JSC (no JIT) 10-80x, 2-10x plus a marshalling boundary"). | L129, L211 |

Decisions about Hermes, JSI or Node-API as engines: none. Node-API and WIT are cited only as models for the native ABI (D1, `native.h` header comment, ZN-096). `docs/reports/ios-core-runtime.md:42-59` lists Hermes and JSC as possible embedded interpreters for iOS, no task follows.

## 2. How values cross, and what it costs

### 2.1 Whole-program QuickJS (no typed code on the other side)

- Host calls: one JS function `__host_<row>` per `host.*` row of `include/zn/runtime.h`, created with `JS_NewCFunctionMagic(..., JS_CFUNC_generic_magic, i)` (`src/qjs/qjs.cpp:170-171`). The thunk `hostFn` (`qjs.cpp:~85`) decodes arguments by the row's signature letters (`d` double, `s` string, arrays as `std::vector<uint64_t>`), calls the same `zn::host::hostGfx`/`hostSys`/`hostLayout` the typed engines call, and converts the result. Strings and arrays use per-parameter slots in place since ZN-567 (no two vectors per call).
- Typed arrays and `ArrayBuffer`: told apart without an exception (`JS_IsArrayBuffer`, `JS_GetTypedArrayType`) since ZN-567 in `src/gl/webgl_js.cpp` (`bytesOf`).
- Native modules of plugins: `requireNative('Sqlite')` on QuickJS returns a Proxy whose members are `__nativeFn(module, export)` (`src/qjs/native_js.cpp:27-32,155-172`). Each call (`native_js.cpp:84-153`) decodes parameters by the signature letters of `include/zn/native.h`, calls `zn_native_call`, converts the result. Arrays are packed into `std::vector<uint8_t>` (a typed array of the same element type is copied as bytes, otherwise element by element); array results are a copy into a new typed array (`JS_NewArrayBufferCopy`); out-parameter arrays are written back element by element. It does not use the `ZN_PURE_SCALAR` fast flag (grep: only `script_native.cpp:830` uses it). Callbacks (`c(...)`) and promises (`P<t>`) throw a TypeError naming the limitation (`native_js.cpp:181`, task ZN-691, Backlog).
- Measured costs (M1 Pro unless noted, from `docs/reports/quickjs-aot-jit-and-ffi.md` section 0 and `docs/reports/zinc-next-perf.md:341,545-560`): generic JS-to-C method 20-45 ns over an empty loop (lookup 10-15, call machinery about 10, 2-3 per argument); `JS_Call` from native about 14 ns; allocation of a result object 150-185 ns; WebGL binding 70-100 ns per scalar call. Typed-array path: 1,360 ns before ZN-567 (2,230 ns 20 frames deeper), 39-43 ns with the public checks, 33-36 ns with a borrowed pointer (estimate). On the Intel Mac after ZN-567: `uniform4fv(Float32Array)` 2,239-2,281 to 227-242 ns, `bufferSubData(Float32Array)` 2,207-2,210 to 178-184 ns, `drawArrays` 557-636 to 345-403 ns, `drawElements` 60k indices 57-66 us to 11.6 us.
- Typed bunnymark through `__host_*` from QuickJS: 173 + 148 ns per sprite against 15 + 10 ns AOT (`docs/reports/games/js-game-libraries.md:296-307`).

### 2.2 Typed program embedding `zinc:script` (`plugins/script`, `src/qjs/script_native.cpp`, 856 lines)

- Values are `unknown` (Dyn) on the typed side; the native module receives them as JSON text. The generic path writes primitives by hand (`scalarJson`, `scalarFromJson`: `script_native.cpp:80-130`), everything else goes through `JS_JSONStringify` with a replacer (`toJson`, line 183-191) and `JS_ParseJSON` plus a `revive` walk (`fromJson`, 238-242). A script function becomes `{"__zn_fn": n}` (line 178; handle table `refAdd`). Source comment lines 3-5 states the contract.
- The typed side wrapper is `plugins/script/index.ts` (254 lines): `Script`, `ScriptEngine` interface (`eval`, `call`, `set`, `get`, `expose`, `exposeAsync`, `ref`, `callRef`...), limits (memory 16 MiB, time 1000 ms, stack 512 KiB defaults), async settlement through `onEvent`. `'zinc-vm'` is reserved as a second engine behind the same interface (`index.ts:1-5`).
- Fast numeric path, `zinc:script/fast` (`plugins/script/fast.ts`, native module `QuickJSFast`, `script_native.cpp:830`): `exposeNum(script, name, fn)` and `callNum(fn, n, a, b, c, d)`, up to four numbers in, one out, no text, no Dyn, no engine context. Callbacks are stored as `numFns` and invoked with `H->cb_call` (`script_native.cpp:793`).
- Measurements (`tools/bench-bridge`, `tests/bench/script_bridge`; `docs/reports/script-boundary-optimisation.md`, `docs/reports/zinc-next-perf.md:859-905`), us per unit, Mac M1 Pro AOT:

| Case | Before (2026-10-18) | Generic after | Fast | Floor (QuickJS C API, no JSON) | Nexus 7 before / generic / fast / floor |
|---|---|---|---|---|---|
| script to host, one number | 1.02 | 0.51 | 0.057 | 0.040 | 61.6 / 35.8 / 1.45 / 0.72 |
| host to script, one number | 1.07 | 0.93 | 0.142 | n/a | 94.9 / 74.5 / 2.64 / n/a |
| 10k-cell map, one call per cell | 0.83 | 0.42 | 0.057 | 0.041 | 47.6 / 26.6 / 1.45 / 0.73 |
| 5,000 UI ops, one call each | 1.12 | 0.51 | 0.057 | 0.040 | 61.3 / 37.3 / 1.34 / 0.78 |
| host to script, small object | 2.38 | not re-measured | | | 191.7 before |
| 10k-cell map, one Dyn snapshot | 0.126 | | | 0.031 | 3.66 |

  The report's own "Done" section (`script-boundary-optimisation.md:92-101`): 8 to 51 times faster than before and within 1.4 to 2.3 times of the floor for numbers. Not done: binary value encoding for objects and arrays (its item 2), typed callbacks for strings, zero-copy buffers (item 4), a `bench-gate` guard (item 6), the Zinc-side `JSON.stringify`/`JSON.parse` of the generic host-to-script call (still about 0.9 us on the Mac, 62-75 us on the tablets). Finding: filling a buffer from JS costs more per UI operation than one fast call; the fast path, not a command buffer, is the way to send mutations.
- Discrepancy to know: D22 says the C ABI carries JSON text; the report says the Zinc side builds JSON with `JSON.stringify`/`JSON.parse` on Dyn. Both are the same path seen from two sides.

### 2.3 Fixes done or planned

Mapping of the D44 labels to tasks is inferred from the D44 row ("ZN-567, QJS-02/03/04/05/08, ZN-575"), the report section 0 item 8 and the task titles; the tree never writes the table out.

| Item | Task | Status (task file) | What is in the tree |
|---|---|---|---|
| Typed-array no-throw checks, draw-state caches, thunk without vectors | ZN-567 | Review | Done on the Intel Mac. AC1-AC3 thresholds are for the M1 Pro and not yet measured there; notes predict 140 / 110 / 285 ns / 3.7 us. |
| QJS-02 patch queue on pristine quickjs-ng | ZN-595 | Done | `third_party/quickjs-ng/patches/` (section 6) |
| QJS-03 typed fast native calls (`JS_CFUNC_fast`) and borrowed buffer accessors, upstream PR | ZN-596 | Backlog | Not started. Targets: 4-double call 40-45 to <= 30 ns, int call 27 to <= 22 ns, zinc:gfx host call from QuickJS <= 40 ns raw. |
| QJS-04 native accelerators (three matrices/culling/skinning; Pixi sprite batcher) | ZN-543, ZN-582 | Backlog, Backlog | ZN-543 depends on ZN-541 (Backlog). Nothing implemented. |
| QJS-05 hot-function profiler | ZN-598 | Done | `src/qjs/qjs_prof.cpp`, compiled with `ZN_QJS_PROFILE`, patch 0001 |
| QJS-06 bytecode to C spike | ZN-599 | Done (no-go, D55) | `tools/qjs2c`, patch 0002 |
| QJS-07 inline caches | ZN-600 | Done (not adopted, D56); ZN-600.01 Backlog | patch in `docs/reports/zinc-next-qjs-ic.patch`, not in the queue |
| QJS-08 binding rules + `bench/qjs_boundary` T2 gate | ZN-601 | Backlog | Not written. |
| Bytecode cache for `zinc run`, GC scheduling at frame boundaries | ZN-575 | Backlog | Targets: Phaser 3.90 eval <= 100 ms (450-640 ms today), Babylon 9.30 <= 250 ms (1.3 s), 100k live objects p99 frame <= 4 ms (11.8 ms). Partial: `zinc bundle --bytecode` writes `.qbc` (D132, `src/qjs/qjs.h:51-52`), and transformed modules are cached by content hash in `~/.zinc/cache/qjs`. |
| QuickJS bytecode in packs | ZN-445 | Backlog | Depends on ZN-433. |
| zinc:script boundary: plain values by hand, `zinc:script/fast` | (2026-10-18 work, no ZN id in the report) | in tree | `plugins/script/fast.ts`, `tests/conformance/script_fast.ts` |
| ZN-723 bytecode compiler (D110 route 1) | ZN-723 | Backlog, depends on ZN-599 | Gates: three and matter-js frames >= 2x; js-p5 60 fps (frame work p50 <= 12 ms against 16-19); test262 and QuickJS T1 identical; code size reported. |
| ZN-724 measure Longbridge's quickjs-jit | ZN-724 | Backlog | Four criteria (build, patch conflicts with our queue, cost, decision against D110). Note the ID is reused: `backlog/later.md:133` also files a "ZN-724" item about i32 wrap on QuickJS. |
| Worker on a second QuickJS runtime | ZN-587 | Backlog, depends on ZN-568 | |
| Native callbacks and promises for plugin modules on QuickJS | ZN-691 | Backlog | |

## 3. Can one program mix typed Zinc and plain JavaScript?

Short answer: yes, at three different levels, none of which is "import an npm package from a typed `.ts` and have it run on QuickJS with direct calls".

1. Typed host + embedded JS sandbox: `zinc:script` (section 2.2). The typed program owns the window and the loop; JS runs in a `Script` context with only what the host `expose`s (no timers, no web environment). Examples: `examples/scripting/playground` (live-coding), `examples/scripting/breakout-mods` (rules from `assets/rules.js`), `examples/scripting/bench` (costs). Platform: macos, linux, rpi1, rmpp; not esp32/ps1/ps2/wasm (`docs/plugins/script.md` Availability; the bench also ran on Android and webOS, `docs/reports/zinc-next-perf.md:859`).
2. The typed frontend can load a `.js` file as a module and infer types: `loadCandidate` falls back to `.js`/`.mjs` (`src/frontend/modules.cpp:1588-1610`), and `zinc infer` reports every Dyn site and can write a typed `.ts` (`docs/guide/02-language.md:123-131`). This compiles the JS with the Zinc compiler, subject to the typed subset; three.js r186 stops the typed frontend at line 3885 of about 60,600 (`*[Symbol.iterator]()`, quickjs-aot-jit-and-ffi.md section 0 item 4 and D110 L180). Packages such as `three` and `gsap` are Zinc re-implementations, not the JS libraries: `plugins/three` ("three.js API subset on zinc:3d", provides the bare specifier `three`, `modules.cpp:1699`), `plugins/gsap` ("GSAP's core API in Zinc"). `examples/three/*` uses them.
3. Whole program on QuickJS: `.ts`, `.tsx` and `.js` entries all run there with `--engine quickjs` or `"engine": "quickjs"`; a `.js` entry picks it by itself (`docs/guide/11-quickjs-bundle.md:1-25`; `docs/guide/01-getting-started.md:271`; ZN-719 Done). Zinc code is stripped of types (`src/qjs/strip.cpp`, 307 lines) and JSX is lowered, so a `.ts` file can import an npm package (`node_modules` ES modules; `zinc bundle` links CommonJS through esbuild). There is no typed code in that program: typed semantics are lost (`i32` wrap and `f32` rounding are not emulated, `backlog/later.md:133`; `docs/reports/zinc-next-quickjs.md` Limits). Plugins' native modules are reached through `requireNative` (section 2.1), so a plugin's `index.ts` runs unchanged on both engines. Of the 25 programs of `examples.lst` that stop on QuickJS, 19 stop on native callbacks/promises or missing host events (`backlog/later.md:288`; `docs/reports/zinc-quickjs-bundler.md` section 4).
4. The web target is a fourth case: the bundle runs on the browser's engine (D145).

Examples that run JavaScript libraries: `examples/js-p5` (p5.js 1.11.13 WEBGL and 2D, p5 is LGPL so `tools/test-lib p5-1.11.13` downloads it; README), `js-three` (three.js r186 + OrbitControls + GLTFLoader, importmap), `js-pixi`, `js-phaser`, `js-gsap`, `js-anatomy` (framework-free figures drawn on Canvas 2D). Each is `main.js` + `zinc.json` with `"web": true`, e.g. `{ "name": "js-p5", "entry": "main.js", "web": true, "targets": { "sim": { "width": 800, "height": 500 } } }`. `examples/maps` uses the native `zinc:map` plugin (own MVT decoder, D24), not MapLibre; `later.md:744` lists MapLibre for the web target only.

## 4. The web environment

### 4.1 Size and files

| Piece | File | Size |
|---|---|---|
| Environment | `lib/std/webenv.js` | 130,458 bytes, 1,732 lines (D83 said 67 KB at ZN-568; it grew with ZN-569/570/572) |
| Start, natives (file bytes as ArrayBuffer, UTF-8, `structuredClone` via QuickJS's serializer, script as global code) | `src/qjs/webenv.cpp` | 223 lines |
| Canvas 2D | `src/qjs/canvas2d.cpp` + `third_party/canvas_ity` | 471 lines |
| WebGL 1/2 binding | `src/gl/webgl_js.cpp` (module `libzn_webgl`) | 1,539 lines, 243 methods, about 600 constants |
| Shims in every QuickJS context | `kWebShims` (TextEncoder, TextDecoder, AbortController), `src/qjs/qjs.h:60` | |

Switched on by `"web": true` in zinc.json, `ZINC_WEB=1`; `ZINC_WEB=trace` prints each window/document/navigator member a library reads and does not find (`docs/reports/zinc-next-webenv.md`, "Turning it on").

### 4.2 Coverage (from `docs/reports/zinc-next-webenv.md`)

- Window: the global object is `window`/`self`; `navigator`, `location`, `screen`, `innerWidth/Height`, `devicePixelRatio`, `matchMedia` (nothing matches), `getComputedStyle`, `MessageChannel`, `ResizeObserver`, inert `MutationObserver`, `structuredClone`.
- Document: `html/head/body`, elements with attributes, `classList`, `style`, `dataset`, text nodes, fragments, simple selectors only (anything else is a SyntaxError that names it), `<script>` insertion runs (classic as global code, `type=module` through `import()`), `DOMContentLoaded`/`load`.
- Events: capture/target/bubble, `once/passive/signal`, `on<type>`; pointer, mouse, wheel, keyboard and touch events synthesised each frame from host input or a `ZINC_INPUT` script.
- Frames and time: `requestAnimationFrame` on the engine frame loop (entered when `globalThis.__zincFrameCb` is a function, `qjs.cpp`); timers on a virtual clock advanced by frame time; `performance.now()` real or virtual (16.67 ms steps) when `ZINC_DETERMINISTIC`.
- Network and storage: `fetch`, `Request`, `Response`, `Headers`, XHR over project files, `data:`/`blob:`, http(s) through `zinc:net`; `URL` is the typed engine's WHATWG parser (`lib/std/web.ts`); `Blob`, `File`; `localStorage` over `zinc:storage`.
- Canvas: `getContext('webgl'|'webgl2')` is the WebGL binding; `getContext('2d')` is canvas_ity with the text tier (paths, strokes, gradients, shadows, `Path2D`, patterns, 26 composite operations, `toDataURL`, `OffscreenCanvas`; `filter` counted and not thrown; italic drawn upright).
- Images: `Image`/`HTMLImageElement` decoded by `src/res/codec.h` (PNG, JPEG, BMP, GIF first frame, WebP) on the main thread (34 ms for 1024x1024 PNG, 415 ms for 4096x4096); no `createImageBitmap` on purpose (PixiJS would spawn a Worker).
- Not there: layout (a box is what its style says), `innerHTML` markup (kept as text), `DOMParser` (ZN-706 Backlog), `FormData`, streams, cookies, `Worker` (ZN-587), audio (`AudioContext`, ZN-573), gamepads (ZN-574), SVG scenes (`later.md:456`), `filter`.

### 4.3 How pixels reach the renderer

There is no direct canvas-to-GL replay. Each frame the environment walks the canvases of the document: for a WebGL canvas it calls `gl.zincPresent(c._image)` (`lib/std/webenv.js:992-1003`; `src/gl/webgl_js.cpp:405-430`: `glReadPixels` through a double-buffered PBO into a zinc:gfx runtime image, rows flipped, "Zinc's own extension, not WebGL"); for a 2D canvas it calls `c2d.present(bitmap, image)`. The image is then drawn by `zinc:gfx` into the window over black at the box the canvas style gives, so the frame goes through the same command list, damage tracking and renderer (software raster or GL replay) as any Zinc program. Measured: js-p5 canvas upload 1.2 ms at 1600x1000 (D110); read-back 2.1 ms at 1280x960 earlier (`js-game-libraries.md` item 7). `later.md:454` asks for drawing a full-window WebGL canvas straight into the window; not done. The product of D148 on the web target is the opposite (page-made canvas becomes a gfx image).

### 4.4 Libraries known to run (unmodified builds, `docs/reports/zinc-next-webenv.md` "Libraries"; tests in `tests/t1/webenv_*.sh`)

| Library | State | Numbers |
|---|---|---|
| p5.js 1.11.13 | WEBGL and 2D modes (2D SSIM 0.99 against Chrome) | import 136-158 ms, first frame 320-362 ms after the context, frame 0.28-0.60 ms (minimal scene). js-p5 real sketch: 144 lit boxes 25 ms a frame, 40 fps on 120 Hz (D110). 1,000 2D ellipses 30-37 ms a frame with empty context methods (D103). Budget at 60 fps on M1 Pro earlier: about 160 WEBGL boxes. |
| three.js r186 | boots, animates, OrbitControls, TextureLoader, GLTFLoader (js-three) | import 66-77 ms, first frame 350-369 ms (first WebGL2 context 136 ms, first render 110 ms), frame 0.28-0.60 ms. Budget about 550 meshes (27-29 us per mesh), 6,000 animated instances, 50k static instances in 2.4 ms. |
| PixiJS 7.4.3 / 8.22.0 | boot, animate, hear pointer, Assets.load from file, Text SSIM 0.98 | 60-81 ms import, first frame 379-419 ms (7.4.3); 120 ms / 351-361 ms (8.22), frame 0.72-0.78 ms. v8 bunnymark 4.0 us per sprite, about 4,000 sprites at 60 fps; v7 about 2,200 (`js-game-libraries.md:236-250`). |
| Phaser 3.90 | WebGL 1, keyboard/pointer, Text SSIM 0.98 | eval 450-640 ms; about 1,000 arcade sprites at 60 fps (16 us each). |
| Others measured only in the 2026-10-09 research with a DOM layer (no test in tree): Babylon.js 9.30 (WebGL2, eval of 8.6 MB 1.3 s, 370 meshes), Kaplay 3001 (380 sprites), LittleJS 1.27, matter-js, planck.js, cannon-es, GSAP. | | `js-game-libraries.md:20-60` |

GC: cyclic garbage causes whole-heap scans, p99 11.8 ms with 100k live objects, 99-171 ms with 1M (ZN-575, `js-game-libraries.md:277`).

Status caveats: ZN-568 and ZN-569 are `In Progress`, ZN-565 and ZN-571 `Review`, ZN-570 `Backlog` and ZN-572 `Backlog` in their task files, although D83, D98, D103 and the webenv report describe them as working and tested. The report and code win; the task fields are stale. D83 lists as not verified: a WebGL canvas in a real window (the live path ran on SDL's dummy driver only when written), the `resize` event, https and permissions with fetch.

## 5. JIT engine and engine abstraction

### 5.1 ZN-586, "Spike (decision): a JIT JavaScript engine as an optional desktop engine"

File: `backlog/tasks/zn-586 - Spike-decision-a-JIT-JavaScript-engine-as-an-optional-desktop-engine.md`. Status Backlog, ordinal 65500, milestone m-22, labels games, js, decision, size-M. Dependencies: ZN-577 (p5 demo with FPS gates), ZN-578 (PixiJS v8 demo), ZN-579 (Phaser 3 demo), ZN-580 (three.js game demo), all Backlog.

Description: QuickJS runs game-library code 20-40x slower than V8 (60x on a raw sprite loop); run the four demos and the physics/tween libraries on JavaScriptCore (system framework on macOS) behind the same host table and web environment; measure gain, size, start-up and W^X/entitlement constraints; weigh against the AOT route of ZN-562/ZN-563. Conflict with D3, D13, D36 is "an owner decision"; D44 scored the option 32 against 40 for boundary fixes plus accelerators and left it as this task's question.

Acceptance criteria (both open): 1. numbers for the four demos on QuickJS and on the JIT engine; 2. a decision recorded against D3, D13 and D36 with a revisit condition.

Notes (2026-10-12, reopened by D110): the owner wants JavaScriptCore as an optional engine, QuickJS default and reference; work it after ZN-723 is started. System `jsc` runs the `bench/qjs` workloads 6 to 32x faster than QuickJS with JIT and 1.2 to 2.1x without. Embedded in a program JSC has no JIT unless the executable carries `com.apple.security.cs.allow-jit` (`bench/qjs/jsc-host.c`: 6.16 against 0.41 ms); zinc and exported apps that load the module must be signed with it. To settle: the binding (about 4,000 lines are written against QuickJS's C API, `src/gl/webgl_js.cpp` 1,539 of them; `lib/std/webenv.js` is engine-neutral), the cost of a call through JSC's C API (js-p5 makes 4,301 WebGL calls a frame) and the four demos (none run on it). On iOS the framework has no JIT in an app (`docs/reports/ios-core-runtime.md`), so JSC there is an interpreter 1.2-2.1x QuickJS; "the option pays on macOS; iOS is not a reason to take it."

D110's constraints on it: a module beside zinc, the system framework on macOS, never required; Windows and Linux have no system engine; one reference engine keeps tests deterministic. Revisit conditions (L180): ZN-723's gate fails (JSC then carries desktop speed), ZN-586's spike shows the JSC binding costs what the JIT gains, or Apple restricts the entitlement; Longbridge's JIT covers closures/this/calls; quickjs-ng gains a register bytecode or caches.

### 5.2 Other places that touch engine choice

- `ScriptEngine` interface in `plugins/script/index.ts:1-5,38-75`: `engine: 'quickjs' | 'zinc-vm'`; the Zinc VM is "reserved" (`docs/reports/zinc-vm.md`; D110 says libraries do not move to it: its frontend stops at line 3885 of three.core.js and its `Dyn` objects are hash maps without caches, `dynsum` 39.2 against QuickJS 30.2 ms).
- `backlog/later.md`: no line mentions JSC, V8, Hermes, JSI or Node-API (grep). QuickJS-related lines: 100 (no host events: `__addEvHandler`), 118 (Date.now frozen headless), 133 (typed numeric semantics differ on QuickJS), 288-291 (bundler limits), 454 (full-window WebGL canvas), 456 (SVG scene), 479 (webenv calling a host row an older binary lacks), 732-735 (bundle: web globals, `browser` field, CommonJS, Date zone).
- Task files that mention JSC/Hermes/JSI/Node-API: ZN-586, ZN-096 (Node-API as ABI model), ZN-571 (skia-canvas via napi-rs only as a size comparison). Nothing else.
- Other related open items: ZN-595 Done, ZN-724 Backlog, ZN-723 Backlog (section 2.3).

## 6. QuickJS patch queue and native ABI

### 6.1 Patch queue (`third_party/quickjs-ng/patches/README.md`)

- Base: quickjs-ng release v0.17.0 (`third_party/quickjs-ng/PRISTINE`: archive SHA-256 559bc4c4..., per-file hashes); the tree is the release plus the patches in order.
- `0001-profile-hooks.patch` (145 lines): the QuickJS profiler of ZN-598, compiled only with `ZN_QJS_PROFILE`; consumed by `src/qjs/qjs_prof.cpp`. Hunks in `quickjs.c` around the dispatch/`JS_CallInternal`, `JS_FreeRuntime` and the end of the file.
- `0002-aot-hooks.patch` (143 lines): the bind hook of the qjs2c spike (ZN-599), compiled only with `ZN_QJS_AOT_GEN`; `JS_CallInternal` binds a bytecode function at its first call (file, line, column, bytes match) and runs compiled code in the interpreter's frame; exceptions return to the interpreter. Kept although D55 is a no-go because ZN-723 reuses it ("the bind hook of patch 0002 exists", ZN-723 description).
- Not in the queue: the inline-cache patch (D56, `docs/reports/zinc-next-qjs-ic.patch`), the typed fast-call and borrowed accessors (ZN-596, not written).
- Rules: each patch starts with a header `Purpose / Measured / Upstream` before the first `---`, applies with `patch -p1`, `tools/quickjs-patches check` (`tests/t0/quickjs_patches.sh`) proves every patch reverses to the pristine hashes; `tools/quickjs-patches rebase <tag> [--apply]` moves to a new release (checked 2026-10-10: 7 of 19 vendored files differ on master). Verify with `tests/run --only quickjs`, `--only test262_regexp`, and `--tier t2 --only compat` for engine changes.
- Both patches are Zinc-only tooling hooks, so the effective runtime queue of speed patches is empty today.

### 6.2 Native module ABI as QuickJS sees it

- Header `include/zn/native.h`, ABI 1.1 (`ZN_ABI_MAJOR 1`, `ZN_ABI_MINOR 1`), frozen additive, checked by `tools/abi-check` against `tests/data/native-abi-v1.txt`; compiles as C99 and C++20; no C++ exception or engine type crosses it.
- `ZnVal` is a 16-byte union (i64, u64, f64, `ZnStr{p,n}`, `ZnView{p,n}`, handle). `ZnExport{name, sig, fn, flags}`; `ZN_PURE_SCALAR` marks exports with only `i u b d f` in and out (a fast path "of the engine"; used only by the typed engines and `QuickJSFast`). `ZnModule{abi,size,name,exports,kinds,flags,init,poll,shutdown}`; `ZnHostApi` (size-prefixed) offers `set_error`, `ret_str`, `ret_buf`, `res_new/get/retain/release` (generational handles), `cb_retain/release/call`, `cb_error`.
- Signature letters: `s i u b d f n h`, arrays `B I D S` (borrowed copies valid for the call), resources `R<k>`, callbacks `c(sig)`, promises `P<t>`. QuickJS bridging (`native_js.cpp`): arrays are copied in and out, results are copies; no callbacks or promises yet.
- Host rows (`include/zn/runtime.h`): a different, internal table `X(Id, "owner.member", "params>ret", flags)` with letters `d s` and arrays; the QuickJS engine builds one `__host_*` function per row and shares `zn::host` with the typed engines. This is the engine-agnostic seam: the same table serves interpreter, AOT, QuickJS and (D110's plan) a JSC engine.
- Engine-side modules (not plugins): the built-in `QuickJS` and `QuickJSFast` native modules of `zinc:script` are registered by `zinc` and linked into AOT programs that import it (D22; `script_native.cpp:830`).

## 7. Gaps to keep in mind for the report

1. No path today gives typed code a direct, typed handle on a JS object or function other than JSON/Dyn text, the numbers-only fast path, or `{"__zn_fn": n}` handles. Strings, arrays and typed arrays have no fast typed path across `zinc:script` (explicitly "not done").
2. The cheap direction (JS to native) already costs 20-45 ns for scalar calls and 33-43 ns with borrowed typed arrays, close to the 22-73 ns of other runtimes (D44 report section 6; RN Nitro about 73 ns). The expensive direction is native to JS (0.142 us on the Mac through the fast path, 1 us generic) and anything with objects.
3. The speed ceiling is the QuickJS interpreter (2.9-4.8 ns per bytecode; 57% of js-p5 script time in `JS_CallInternal`, 43% in its object/property runtime), not the boundary (binding about 9% of js-p5's script per D110). JSC/V8 gains are 5 to 32x with a JIT and 1.0 to 2.1x without.
4. Everything D110 plans is unstarted: ZN-723, ZN-724, ZN-586 and its four demo dependencies are all Backlog; ZN-596 (typed fast calls) and ZN-543/ZN-582 (accelerators) are Backlog; ZN-575 (bytecode cache for `zinc run`, GC) is Backlog.
5. The M1 Pro numbers of D110 were taken at load 4.5 to 6 with one run each ("to retake alone"); D55/D56 numbers are from the idle Intel Mac; the boundary table is M1 Pro under load 4 to 7.
