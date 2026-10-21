# A `WebAssembly` global for Zinc's QuickJS-ng engine

Research of 2026-10-21 (web, read-only). Question: does any fork or extension of QuickJS or QuickJS-ng provide the JS `WebAssembly` API, so that Spline's runtime wasm modules run under `--engine quickjs`, and what is the cheapest robust way to expose it in Zinc?

## Summary

- QuickJS-ng itself has no WebAssembly plan: no open issue or discussion asks for it (search of `repo:quickjs-ng/quickjs wasm` finds only WASI/Emscripten *build* issues). It is an engine, and the wasm runtime is left to the embedder.
- **txiki.js (saghul) is the only real prior art, and it moved from wasm3 to WAMR on 2026-10-15** (commit "wasm: replace wasm3 with WAMR", PR #652: "wasm3 is no longer maintained and very slow"). It now ships a nearly complete JS API on QuickJS-ng + WAMR: `src/wasm.c` (2124 lines, MIT) plus `src/js/polyfills/wasm.js` (743 lines). It is liftable, but it is bound to the WAMR C API and to txiki's class-id helpers.
- **The Spline modules are not Emscripten.** `physics.wasm`, `boolean.wasm` and `bevel.wasm` are Rust `wasm-bindgen` builds (Rapier etc.); only `process.wasm` (subdivision) is Emscripten-style (minified `a`..`z` imports). Measured with a section scanner on the files from `cdn.spline.design` runtime 2.0.98 (see "Measured").
- **wasm3 0.5.0 (vendored) cannot run all four.** `boolean.wasm` and `bevel.wasm` declare `reference-types` and `bulk-memory` (and `boolean` also `simd128`); 0.5.0 has only `memory.copy`/`memory.fill` and no reference types or SIMD. But **wasm3 is alive again**: v0.9.0 (2026-08-24) and v0.9.1-beta.1 (2026-09-10) add full bulk memory, reference types, tail calls, exception handling, multi-memory, memory64, "10-50% speedup", and fuzz fixes. Still no SIMD.
- **Recommendation: write a thin native `WebAssembly` binding in `src/qjs/` over wasm3, after upgrading the vendored wasm3 from 0.5.0 to 0.9.x; borrow the JS-side design (and test list) of txiki's `wasm.js`, not its C.** Fall back to WAMR (what txiki did) only if wasm3 0.9 fails on `boolean.wasm` (SIMD) or is too slow. Details and estimates below.

## What exists (evaluated)

| Project | URL | Licence | Activity | Wasm runtime | JS API completeness | Notes |
|---|---|---|---|---|---|---|
| quickjs-ng | https://github.com/quickjs-ng/quickjs | MIT | pushed 2026-10-20, ~4.0k stars | none | none | No wasm issue or plan. Its docs only cover *building* QuickJS to wasm (WASI, Emscripten). |
| txiki.js | https://github.com/saghul/txiki.js | MIT | pushed 2026-10-21, 3.3k stars, v26.6.0 (2026-06) | **WAMR** (`deps/wamr`, interpreter only: `WAMR_BUILD_INTERP=1`, `FAST_INTERP=1`, AOT/JIT off, SIMD, REF_TYPES, BULK_MEMORY, LIBC_WASI, MULTI_MODULE on) since 2026-10-15; wasm3 before | Module, Instance, Memory (grow, detach tests), Table (get/set/grow), Global, funcref and externref, CompileError/LinkError/RuntimeError, `validate`, `compile`, `instantiate`, `compileStreaming`, `instantiateStreaming`, WASI | Tests `tests/test-wasm-*.js` (externref, funcref identity and cross-instance, memory-grow use-after-free, import global/memory). Build option `BUILD_WITH_WASM`. Mac, Linux, Windows, Android. |
| QuickJS-ng + wasm3 or WAMR bindings on GitHub | searches "quickjs wasm3", "quickjs wamr" | n/a | none found (only `KaruroChori/vs-fltk`, a UI toolkit with quickjs + wamr scripting, 10 stars, NOASSERTION) | | | Nothing reusable beyond txiki. |
| AWS LLRT | https://github.com/awslabs/llrt | Apache-2.0 | active | none (rquickjs) | **none**: compatibility matrix lists WASM-JS-API-2 and WASM-WEB-API-2 as unsupported | Dead end. |
| PrimJS (Lynx) | https://github.com/lynx-family/primjs | Apache-2.0 | active, 1.1k stars | none found | none found | A QuickJS fork with a JIT-less speed focus; no WebAssembly in its description. Not verified in code. |
| Frida's QuickJS | https://frida.re | wxWindows | n/a | none | none | Frida uses QuickJS or V8 for scripts; no WebAssembly global known. Not verified in code. |
| Hermes | https://github.com/facebook/hermes | MIT | active | none | none | The language feature list never mentions WebAssembly; no `WebAssembly` global in Hermes. |
| quickjs-emscripten, quickjs-wasi, wasmedge-quickjs, qjs (Go/wazero), javy | https://github.com/justjake/quickjs-emscripten, https://github.com/vercel-labs/quickjs-wasi, https://github.com/second-state/wasmedge-quickjs | MIT / Apache | various | n/a | n/a | Opposite direction (QuickJS *inside* wasm, or a wasm host that embeds QuickJS). Irrelevant, except `wasmedge-quickjs` exposes WASI-style host APIs, not a `WebAssembly` global. |
| WAMR | https://github.com/bytecodealliance/wasm-micro-runtime | Apache-2.0 with LLVM exception | pushed 2026-10-21, 6.2k stars, WAMR-2.4.5 (2026-06) | itself: classic and fast interpreter, AOT (`wamrc`, LLVM), fast JIT and LLVM JIT | **No JS API of its own.** C embedding API (`wasm_export.h`, `wasm_c_api.h`). The only JS-API shim on top of it is txiki's. | Targets: Linux, macOS, Windows, Android, ESP-IDF, Zephyr, NuttX, RT-Thread; archs x86, ARM, AArch64, RISC-V, Xtensa, MIPS, ARC. Supports tail call, GC, exception handling (off by default), SIMD (default on). |
| wasm3 | https://github.com/wasm3/wasm3 | MIT | main pushed 2026-09-29, 8.1k stars, **v0.9.0 2026-08-24, v0.9.1-beta.1 2026-09-10** (v0.5.0 was 2021-06) | itself, interpreter only | C API only; our `plugins/wasm` wraps it | Builds on everything incl. ESP32 and iOS/wasm (no code pages needed). |

Notes on txiki.js: its design splits the work. C (`wasm.c`) exposes ~25 primitive functions (`parseModule`, `buildInstance`, `callFuncByIndex`, `getMemoryBuffer`, `growMemory`, `getGlobal`/`setGlobal`, `tableGet`/`tableSet`/`tableGrow`, `resolveImports`...), and JS (`wasm.js`) builds the spec classes on top. Host imports: a JS function called from wasm; when it throws, the original JS exception is saved on the instance, WAMR is told to trap, and the exception is rethrown after the wasm call returns (`pending_exception`). `Memory.buffer` is an ArrayBuffer over WAMR's linear memory that is detached on grow (tests `test-wasm-memory-detach.js`, `test-wasm-memory-grow-import-uaf.js`). WAMR's `WAMR_DISABLE_HW_BOUND_CHECK 1`: software bounds checks, portable, slower.

## What the Spline modules need (measured)

Files from `https://cdn.spline.design/@splinetool/runtime@2.0.98/build/*.wasm`, scanned with a small Python section/import parser (not a disassembler; opcode use inside code bodies not counted).

| Module | Size | Toolchain (from imports/features) | Declared features | Imports | Needs beyond MVP+sign-ext |
|---|---|---|---|---|---|
| `physics.wasm` | 1,569,588 | Rust `wasm-bindgen` (imports `wbg.__wbindgen_*`, `__wbg_*`; 538 exports; Rapier) | no `target_features` section, but has a `datacount` section | 32 function imports, 0 `invoke_` | probably bulk memory (`datacount` is emitted when `memory.init`/`data.drop` are used or allowed); not proven |
| `boolean.wasm` | 162,203 | Rust `wasm-bindgen` | `mutable-globals`, `nontrapping-fptoint`, `simd128`, `bulk-memory`, `sign-ext`, `reference-types`, `multivalue` | 2 (`__wbindgen_init_externref_table`) | **SIMD, reference types (externref table), bulk memory, multi-value** |
| `bevel.wasm` | 123,564 | Rust `wasm-bindgen` | same, without `simd128` | 2 | reference types, bulk memory, multi-value |
| `process.wasm` (subdivision) | 329,327 | Emscripten-style minified (`a`..`z`) | no features section; `datacount` present | 28 function imports (module `a`) | to be checked; probably MVP plus bulk memory |

So: there are no `invoke_*` trampolines here (those only appear in Emscripten builds that use JS-side C++ exceptions), the glue is wasm-bindgen's JS (`*_bg.js`) that uses `WebAssembly.instantiate`, `new WebAssembly.Memory` access via the instance's exports, `wasm.memory.buffer`, `Uint8Array` views re-created when `byteLength === 0` (detached buffer after growth), `__wbindgen_init_externref_table` (a `WebAssembly.Table` of externref: `table.grow`, `table.set`) and `FinalizationRegistry`. The shim must therefore give: `exports.memory.buffer` that is detached and replaced on growth, `exports.__wbindgen_export_*` tables with `grow`/`set`/`get` for externref, and BigInt for i64.

Emscripten generally (for other modules): current Emscripten and LLVM turn on `mutable-globals`, `sign-ext` and (in recent versions) `nontrapping-fptoint`, `bulk-memory`, `multivalue`, `reference-types` by default; `-msimd128` is opt-in. This was not confirmed from the Emscripten reference page (the fetched excerpt did not list defaults), so treat it as a to-verify. Exceptions: default `DISABLE_EXCEPTION_CATCHING=1` (no catch code); with C++ exceptions enabled the JS-based mode generates `invoke_*` imports (host functions that call back into wasm: `stackSave`, `dynCall`, `stackRestore`, `setThrew`) and needs wasm-to-host-to-wasm re-entrancy plus propagation of a host-thrown JS exception; the native mode (`-fwasm-exceptions`, `WASM_LEGACY_EXCEPTIONS=true` by default, or exnref) needs the exception-handling proposal in the runtime.

## Feature matrix of the candidate runtimes

| Feature | wasm3 0.5.0 (vendored) | wasm3 0.9.1-beta.1 | WAMR 2.4.x (interpreter) |
|---|---|---|---|
| sign-extension, saturating trunc, mutable globals | yes (opcodes 0xC0-0xC4, 0xFC 0x00-0x07 present in `m3_compile.c`) | yes | yes |
| multi-value | yes (0.5.0 release notes) | yes | yes |
| bulk memory | only `memory.copy`, `memory.fill` | full | yes (`WAMR_BUILD_BULK_MEMORY`) |
| reference types, table.get/set/grow, externref | no | yes | yes (`WAMR_BUILD_REF_TYPES`) |
| exception handling | no | yes (exnref; legacy EH not stated) | yes, off by default (`WAMR_BUILD_EXCE_HANDLING`), legacy proposal |
| SIMD (v128) | no | **no ("N/A")** | yes (`WAMR_BUILD_SIMD`, default on; fast interp may use SIMDe) |
| tail calls | no | yes (needs `musttail`) | optional |
| memory growth | `m3_ResizeMemory` | yes | yes |
| speed tier | interpreter (threaded "meta-machine") | interpreter, "fold and fuse" +10-50% | fast interpreter (about 2x the classic one, 2x memory); AOT and JIT available but not usable on iOS/consoles and need `wamrc`/LLVM |
| licence | MIT | MIT | Apache-2.0 + LLVM exception |
| footprint | about 64 KB code | similar | interpreter about 85 KB, AOT runtime about 29 KB (WAMR's own figures) |
| ESP32, ARM, Windows | yes | yes | yes (ESP-IDF, Xtensa, AArch64, Windows) |

Caveat: `boolean.wasm` uses `simd128`. Neither wasm3 version can run a module that contains a v128 instruction, and a module that merely *declares* the feature in its custom section is fine; whether the code bodies really contain SIMD opcodes was not decoded here. If they do, only WAMR (or V8/JSC) runs `boolean.wasm`; the other three modules are within wasm3 0.9's reach.

## Options and recommendation

1. **Lift txiki.js's binding as is (WAMR).** Fastest to a complete API (about 2,900 lines MIT, with 20+ tests to copy), SIMD works, and the same WAMR could later serve the typed engine. Costs: add WAMR (about 100 source files via its cmake script, Apache-2.0) as a second wasm runtime next to wasm3 (or replace wasm3 and rewrite `plugins/wasm/native/wasm.host.cpp`, 193 lines), rewrite the txiki glue (`tjs__class_id`, `TJS_CFUNC_DEF`, `TJS_CLASS_*`, its event loop and WASI parts) to Zinc's `src/qjs` conventions, and WAMR touches internals (`WASMTableInstance`, `module_inst->tables[]`) in the table code. Effort: about 3 to 5 days.
2. **Thin binding over the vendored wasm3, upgraded to 0.9.x (recommended).** Write `src/qjs/wasm.cpp` (about 600-900 lines: parse/compile, instantiate with function imports and exported memory, tables, globals, `Memory.grow` with detach, import thunks that call a JS function, saved-exception rethrow like txiki), reuse txiki's `wasm.js` class layer in spirit (copy the MIT file with attribution and adapt), and expose it as a global in `webenv.cpp`/`prelude.cpp` where `bundle.cpp:144` now warns "WebAssembly is not in QuickJS-ng". Keep one wasm3 for both the typed `zinc:wasm` and QuickJS. Steps: (a) bump `plugins/wasm/vendor/wasm3` to 0.9.1 and rerun `tests/conformance/wasm.ts`; (b) run the four Spline modules through the typed plugin's `validate`/`compile` first (one-hour smoke test that decides between options 2 and 1); (c) the binding. Effort: about 3 days for the binding and tests after a half-day upgrade, if the upgrade does not break the existing plugin API (0.9 changed some config and the WASI layer; the plugin only uses the core API).
3. **WAMR for speed.** Only worthwhile if (b) shows a SIMD module that must run, or physics is too slow. WAMR's fast interpreter is not clearly faster than wasm3 (wasm3 0.9.1's fold/fuse optimisations narrowed the gap, and WAMR's own docs call the fast interpreter about 2x the classic one, not near native); the real speedup is AOT or JIT, which need `wamrc` (LLVM) or code pages, which iOS and consoles forbid and which add a toolchain dependency Zinc's "modest machines, one tool" goals dislike.

Do not wait on the V8/JSC effort: those engines have `WebAssembly` natively, but QuickJS stays the engine for the small targets (ESP32, TouchPad, Nexus 7) where V8/JSC do not run, so a QuickJS `WebAssembly` is the only path to Spline there.

## Performance expectation (estimate, not measured)

- A wasm interpreter of this class (wasm3) is typically 4 to 15 times slower than a wasm JIT, itself about 1 to 2 times native: so Rapier at about **10 to 40 times native**. A small Spline scene (tens of bodies) steps in a few milliseconds natively at worst, so roughly a few to a few tens of milliseconds per step on the Mac: usable at 30 to 60 fps for the public sample scenes, marginal on a Pi 3 or tablets (there, step at a lower rate or fewer substeps).
- Startup: wasm3 compiles lazily per function at first call; WAMR's fast interpreter pre-compiles the whole module on load (a 1.5 MB `physics.wasm` may take a few hundred milliseconds and about twice the module size in RAM). Boolean, bevel and subdivision calls are bursty and short: fine on an interpreter.
- Needs a measurement when built: step time of the sample scene `iEAs8HJFu91daMOq` (rectangle + cube with physics) on wasm3 0.5/0.9 and, if option 3 is tried, WAMR fast interp; log in `docs/reports/zinc-next-perf.md`.

## Not verified

- PrimJS and Frida: no WebAssembly found in their READMEs or descriptions; not checked in code.
- Whether `physics.wasm` and `process.wasm` code bodies use `memory.init`/`data.drop`, ref-type table ops or SIMD (they carry a `datacount` section; no disassembler was available). A decoder pass over the code section (about 60 lines of Python, or `wasm-objdump` from wabt) settles it; wasm3 0.9's own `validate` is the cheaper check.
- Emscripten's default feature set per version (the settings reference excerpt fetched did not list it).
- wasm3 0.9 API compatibility with `plugins/wasm/native/wasm.host.cpp`, and its build on the Zinc targets (ESP32, rpi1, rmpp).
- Timing numbers above are from general knowledge of the runtimes, not from a run.

## Sources

- https://github.com/quickjs-ng/quickjs (and issue search `repo:quickjs-ng/quickjs wasm`)
- https://github.com/saghul/txiki.js (`src/wasm.c`, `src/js/polyfills/wasm.js`, `CMakeLists.txt`, `.gitmodules`; PR https://github.com/saghul/txiki.js/pull/652)
- https://github.com/bytecodealliance/wasm-micro-runtime (`README.md`, `doc/build_wamr.md`)
- https://github.com/wasm3/wasm3 (README feature table, releases v0.5.0, v0.9.0, v0.9.1-beta.1)
- https://github.com/awslabs/llrt (compatibility matrix)
- https://github.com/facebook/hermes/blob/main/doc/Features.md
- https://github.com/lynx-family/primjs
- https://github.com/justjake/quickjs-emscripten, https://github.com/vercel-labs/quickjs-wasi, https://github.com/second-state/wasmedge-quickjs
- https://emscripten.org/docs/tools_reference/settings_reference.html
- https://cdn.spline.design/@splinetool/runtime@2.0.98/build/{physics,boolean,bevel,process}.wasm (scanned locally)
- Local: `plugins/wasm/`, `src/qjs/bundle.cpp:144`, `docs/reports/spline-research.md`
