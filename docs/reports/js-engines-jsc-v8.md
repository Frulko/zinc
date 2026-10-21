# JavaScriptCore and V8 next to QuickJS: one binding ABI, engines as downloaded packs

Study, 2026-10-21. Question (owner): make `--engine jsc` and `--engine v8` possible next to QuickJS-ng, keep the three engines, with a fast
and clear ABI so any engine plugs in without losing features, and engines downloaded automatically (latest version or another good way).
This is the design and its evidence (an inventory of the code, web surveys with links inline, and measurements on this Mac); ZN-773 and its
subtasks carry it out. Step 1 (ZN-773.01) is done: the bindings of the QuickJS engine run on Node-API.

Why it is worth it: `docs/reports/quickjs-aot-jit-and-ffi.md` measured V8 with its JIT 8-36x faster than QuickJS on the same JavaScript
(three.js, the game libraries of `webenv`). The typed engine (interpreter and AOT) is not concerned: `--engine` only chooses who runs
plain JavaScript.

## 1. What is tied to QuickJS today

Small and well contained: 8 files of the engine, about 6,500 lines. The other 32 plugins include no `quickjs.h` (they go through the C
registry of `include/zn/native.h`).

| File | Lines | Binds | QuickJS features used |
|---|---|---|---|
| `src/qjs/qjs.cpp` | 746 | the driver, `__host_*` from the `runtime.h` table, the module loader | module loader and normalizer, `.qbc` bytecode, `import.meta`, pending jobs, rejection tracker, stack limit |
| `src/gl/webgl_js.cpp` | 1539 | WebGL 1/2 (`libzn_webgl`, dlopen'ed, `JS_*` by dynamic lookup) | classes + opaque + finalizers, getters/setters, typed arrays and DataView in place |
| `src/qjs/canvas2d.cpp` | 471 | Canvas2D bitmaps | class + opaque + finalizer, ArrayBuffer in place |
| `src/qjs/webenv.cpp` | 223 | the web environment helpers | external ArrayBuffer with a free callback, promise state, `structuredClone` by bytecode |
| `src/qjs/native_js.cpp` | 194 | `zinc:native` (plugins) | function data, typed arrays (callbacks and promises are not carried yet, on any engine) |
| `src/qjs/script_native.cpp` | 856 | `zinc:script` (D22): sandboxed scripts | memory limit, interrupt handler, several runtimes, promises from C |
| `src/text/segmenter_js.cpp` | 69 | `Intl.Segmenter` shim | one function |
| `src/qjs/qjs_prof.cpp` | 186 | profiler (`ZN_QJS_PROFILE`, off) | patched internals: QuickJS only, not ported |

Dispatch: `src/main.cpp:1591-1663` (`strcmp(argv[4], "quickjs")`), `src/cli_core.cpp:321-357` (`pickEngine`, zinc.json `"engine"`
allow-list), `zinc test --runner`, `zinc compat --engines` (`tests/compat/run.mjs:49`). The run loop (`drain`, `timerLoop`, `frameLoop`)
is mostly JavaScript (`prelude.cpp`) plus host rows: per engine it needs only microtask drain, rejection tracking, call a function, read a
global.

## 2. The ABI: Node-API, not JSI

Both were weighed (survey of 2026-10-21):

| | JSI (React Native) | Node-API (`js_native_api.h`) |
|---|---|---|
| Nature | C++ virtual interface, `std::function`, `shared_ptr`, exceptions across the boundary | C ABI, versioned (NAPI_VERSION 10), stable |
| Binary built once, loaded by any engine | no: same compiler, libc++ and `jsi.h` revision required | yes |
| Promises, all typed arrays, DataView, type tags, external ArrayBuffer | no promise creation, `Uint8Array` only, no DataView | yes |
| Implementations, QuickJS-ng / JSC / V8 | alpha / community repo / stale (Kudo) or microsoft/v8-jsi | BabylonJS/JsRuntimeHost (MIT, active 2026-10: quickjs-ng, JSC C API, V8, Hermes), NativeScript/napi-android (MIT), Node's own `js_native_api_v8.cc`, upstream Hermes |
| Who else uses it across engines | RN (Hermes, JSC) | Node and Deno (V8), Bun (JSC, ~95%), NativeScript (4 engines), react-native-windows (Hermes; JSI is layered on it: microsoft/node-api-jsi) |
| Call cost | ~27 ns host function on Hermes | equal to JSI within noise on V8, QuickJS, Hermes, JSC ([NativeScript/runtimes#75](https://github.com/NativeScript/runtimes/pull/75)); ~7 ns vs ~2 ns direct on JSC ([Bun](https://bun.com/blog/compile-and-run-c-in-js)); 20 vs 8 ns direct on V8 ([node#21072](https://github.com/nodejs/node/pull/21072)) |

**Choice: Node-API is the single binding ABI**, written in C++ with node-addon-api's header-only `Napi::` classes (MIT). It is what D1
already borrowed finalizers and versioning from. Bonus: Node addons and napi-rs crates become loadable plugins.

A few nanoseconds per call is the abstraction's price; what dominates is how often a call crosses and how data is shaped (ArrayBuffer
over arrays of objects, 30x on Hermes). Bun pays the same price only for third-party addons and uses generated direct thunks for its own
hot bindings.

Measured here (ZN-773.01, `tests/bench/napi/call.cc`, perf log 2026-10-21): JsRuntimeHost's QuickJS Node-API as published costs 65-83 ns for
a call with two numbers against 21-22 ns for the QuickJS API, and keeps every value a callback creates until a scope is closed by hand (a
hot function grows the heap). Our patch (`third_party/node-api/patches/0001`: handles by value in blocks, a scope around every callback,
arguments read in place, numbers read from their tag) and `napi/inline.h` (the hot calls inlined when the engine's own bindings are
compiled for QuickJS) bring it to 26-28 ns, and an empty call to 15-16 ns against 12-13. Through a real binding the gap is gone (Canvas 2D
`beginPath` + `moveTo`: 164-166 ns per pair against 167). So, as the owner asked (the fastest path):

- **The `__host_*` rows keep a direct path generated per engine** from the `runtime.h` table: on QuickJS the code that was already there,
  on V8 and JSC the same table emitted against their own API (V8 Fast API calls where they apply).
- **Everything else is written once against Node-API** (plugins, `zinc:native`, Canvas 2D, Intl.Segmenter, the web environment's helpers,
  WebGL), compiled per engine, with the inlined hot calls on QuickJS.
- What only an engine can do (its serializer for `structuredClone`, its module loader) stays an engine service, one per engine.

What Node-API does not cover goes into a small C interface, `zn_engine` (version 1), that bindings never see:

```c
// include/zn/engine.h: one per engine, the only engine-specific code besides the Node-API implementation
typedef struct zn_engine {
  uint32_t abi;                                     // ZN_ENGINE_ABI, refused when different
  const char* name; const char* version;            // "v8", "15.6.75"
  napi_env (*create)(const zn_engine_limits*);      // stack and heap limits; a RangeError, not a crash, on overflow
  void (*destroy)(napi_env);
  napi_status (*run_script)(napi_env, const char* src, size_t len, const char* name, const void* cache, size_t cache_len, napi_value* result);
  napi_status (*code_cache)(napi_env, const char* src, size_t len, void** out, size_t* out_len);  // NULL when the engine has none
  void (*drain_microtasks)(napi_env);
  void (*on_unhandled_rejection)(napi_env, void (*cb)(napi_env, napi_value reason, void* data), void* data);
  void (*interrupt)(napi_env);                      // from another thread: terminate the running script
  int  (*inspector)(napi_env, int port);            // CDP; 0 when unsupported
  const struct napi_table* napi;                    // the napi_* entry points of this engine
} zn_engine;
const zn_engine* zn_engine_v1(void);                // the one symbol a pack exports
```

One engine per process for the program. The module carries the trampoline (`napi_X` calls `table->napi_X_`, one indirect call): the engine
hands it a `zn_napi_table` (`include/zn/napi_table.h`, filled in one line from the engine's own `napi_*`) when it opens the module, so one
build of `libzn_webgl` (ZN-773.02) resolves no `JS_*` or `napi_*` from the program and runs on whatever engine is loaded. `zinc:script`
keeps its own QuickJS on the direct API (D22): it is a sandbox with memory and time limits, inside whichever engine runs the program.

## 3. Modules, bytecode and the other gaps

| Need | QuickJS | V8 | JSC |
|---|---|---|---|
| ES modules (`zinc:*`, plugins, importmap) | its loader, unchanged | `zinc bundle` (pinned esbuild, exists) gives one script; V8's module API later if dev reload asks for it | `zinc bundle` to one script (the C API has no modules) |
| Startup cache | `.qbc` | `ScriptCompiler::CachedData` | none public: parse each run |
| Microtasks, rejections | `JS_ExecutePendingJob`, tracker | `PerformMicrotaskCheckpoint`, `SetPromiseRejectCallback` | drained on return; rejection tracking is SPI on the C API: wrap `Promise` in the prelude |
| Stack and heap limits | yes | `ResourceConstraints`, stack limit | stack by `JSContextGroup` limits (partly SPI) |
| Inspector | none (react-native-quickjs has a CDP module to borrow) | v8-inspector: Chrome DevTools works, a new feature | `JSGlobalContextSetInspectable`: Safari Web Inspector on macOS |
| `Intl.Segmenter` | the libunibreak shim | native | native |
| JIT | none | yes (not on iOS, consoles) | yes on macOS with the `allow-jit` entitlement; never on iOS for an app |

Fast Refresh: QuickJS programs restart on save today (`zinc dev`); V8 and JSC do the same, nothing lost.

## 4. Where the engines come from

**JavaScriptCore** (LGPL-2.1: shipped as a shared library, never statically inside `zinc`)

| Host | Source | Download |
|---|---|---|
| macOS, iOS | the system `JavaScriptCore.framework`, C API stable since 10.5, ES level of the OS's Safari | none: the JSC backend (Node-API on the C API, ~90 KB from JsRuntimeHost) is built into `zinc`, the framework weak-linked |
| Linux, Raspberry Pi | `libjavascriptcoregtk-4.1` (Debian 13 and Ubuntu 24.04: 2.52.6). Only 4.1 has the C API; 6.0 has only the GLib API | the small pack (our backend) `dlopen`s it; missing, the error says `sudo apt install libjavascriptcoregtk-4.1-0`. JIT on armhf to check on the Pi |
| Windows, Android | [oven-sh/WebKit](https://github.com/oven-sh/WebKit/releases) (Bun's builds: static JSC with the C API and headers, several builds a day; use the non-LTO archives and the commit Bun pins in `scripts/build/deps/webkit.ts`) | a pack: our shared library linking those archives |

**V8** (BSD-3). No maintained prebuilt V8 is linkable by a C++ embedder today: rusty_v8 uses Chromium's libc++ (`std::__Cr`) and needs Rust
symbols; kuoruan/libv8 stopped at 13.1; the npm and NuGet builds are dead or Windows-only; ClearScript exports only its own API. So we
build it: one GitHub Actions workflow in a repository of the organization (`zinc-engine/engines`), V8 monolith with
`v8_monolithic=true is_component_build=false v8_use_external_startup_data=false v8_enable_i18n_support=true v8_enable_temporal_support=false
v8_generate_external_defines_header=true symbol_level=0`, linked with the Node-API backend into `libzn_engine_v8`. About 65-80 min per target
on a runner; macOS x64 is cross-built on arm64, armhf from Linux x64. Since only C symbols leave the pack, the libc++ inside it does not
matter (the custom libc++ can even stay on, hidden).

**One mechanism for every pack: the signed index that already serves plugins** (`src/tc/tuf.h`, D41: Ed25519 signatures, rollback, freeze
and revocation protection, mirrors, `ZINC_OFFLINE`).

- A pack is a TUF target `engines/<engine>/<version>/<host>.tar.xz` holding `libzn_engine_<engine>.<dylib|so|dll>`, the licence and, for
  LGPL, the source link. Its `custom` field says `{"zn_engine_abi": 1, "napi": 10, "upstream": "15.6.75"}`.
- First `zinc run --engine v8` (or zinc.json `"engine": "v8"`): the newest pack of the index whose `zn_engine_abi` this `zinc` speaks is
  downloaded with the progress bar of `src/tc/progress.cpp` into `~/.zinc/engines/v8-<version>-<host>/`, hash and signature checked, then
  `dlopen`ed (the WebGL module's loader in `src/main.cpp:1271` is the pattern; it gains the ABI check it lacks today).
- "Latest", safely: a weekly scheduled workflow reads the upstream (V8 stable from `chromiumdash.appspot.com/fetch_releases`, JSC from Bun's
  pinned WebKit commit), builds the packs, runs the engine tests on them, and only then signs and publishes them. So the latest pack is
  always a tested one, and security fixes (V8 ships one about every two weeks) reach users without a new `zinc`.
- The once-a-day check `src/tc/selfupdate.cpp` already does prints `v8 15.7.x is available: zinc engine update` (one line, never a
  surprise download during a run).
- Reproducible apps: zinc.json may pin `"engine": "v8@15.6"`; `zinc export`, `pack` and `fuse` copy the pack used into the app, and
  `tools/sign-macos` adds `com.apple.security.cs.allow-jit` when the app uses V8 or JSC.
- CLI: `zinc engine list | install <name>[@ver] | update | remove`, and a `doctor` line per engine. Own builds: `ZINC_ENGINE_V8=<path>`,
  as `ZINC_ESBUILD` today.

Rejected: pins compiled into `zinc` only (as esbuild): a V8 security fix would need a `zinc` release. Downloading upstream "latest" as is:
untested against our backend, and for V8 there is nothing to download.

## 5. txiki.js and WebAssembly

The owner asked whether QuickJS could be swapped for txiki.js to get features such as WebAssembly, as an optional download. Survey of
2026-10-21 ([saghul/txiki.js](https://github.com/saghul/txiki.js), v26.6.0 of 2026-06-22, MIT): txiki.js is not another engine but a
runtime around QuickJS-ng (its pin older than our 0.17.0) with its own libuv loop, fetch, WebSocket, workers, timers, FFI and SQLite. Its
`tjs` static library has a small C API (`TJS_NewRuntime`, `TJS_Run`) but no stable ABI, and it owns its event loop and vendors libuv: in
zinc that is a second loop and a second copy of libuv and of every web API, with different semantics. Zinc already has fetch, sockets,
SQLite and FFI as plugins.

Its WebAssembly is the part worth having: [WAMR](https://github.com/bytecodealliance/wasm-micro-runtime) 2.4.5 (Bytecode Alliance,
Apache-2.0 with LLVM exception, fast interpreter; it replaced wasm3, in minimal maintenance since 2022), with the `WebAssembly` JS API
written in `src/wasm.c` and `src/js/polyfills/wasm.js` (MIT). **Decision: take that part, not txiki.js**: the `WebAssembly` global over WAMR,
written against Node-API, installed only on an engine that lacks it (QuickJS: V8 and JSC have it natively), shipped as a pack like the
engines (ZN-773.06). WAMR's core also runs on the ESP32, which a desktop JIT never will.

## 6. Plan

Each step can be measured before the next starts. Creating these tasks needs the owner (`New-task: owner ...`, the backlog is frozen).

1. **Node-API on QuickJS, same behaviour, measured (done, ZN-773.01).** JsRuntimeHost's Node-API vendored and patched
   (`third_party/node-api`), `native_js`, `segmenter_js`, `canvas2d` and the `webenv` helpers ported, the context hooks receive a
   `napi_env`. `include/zn/engine.h` and the trampoline come with the second engine (step 3), when there is something to choose between.
2. **WebGL on Node-API** (`webgl_js.cpp`, the largest). Gate: `webgl_js`, `webgl2_js`, `three`, and the WebGL conformance at the
   milestone. The hot draw calls keep a generated direct path if step 1's bench says so.
3. **`--engine jsc` on macOS**, built in (system framework): dispatch, zinc.json, `zinc test --runner jsc`, `compat --engines next-jsc`,
   the bundle-to-script path. Gate: `qjs_demos`, `three`, `webenv_*` games on jsc; the perf log gets three.js on QuickJS vs JSC.
4. **Engine packs**: `zinc engine`, TUF targets, the loader with its ABI check, export/pack/sign. Gate: a T0 test with a local
   `file://` index (tampered pack refused, wrong ABI refused), as `tests/t0/tc.sh` does for zig.
5. **`--engine v8`**: the CI workflow, the pack, v8-inspector on `zinc dev`. Gate: the same tests as step 3 on v8.
6. **WebAssembly on QuickJS** (ZN-773.06): WAMR and txiki's binding, as a pack.
7. **Cross-platform pass** (later): the Linux JSC pack and the Pi JIT check, Windows and Android from Bun's WebKit, V8 armhf.

Not ported: the QuickJS profiler and qjs2c (QuickJS internals); V8 and JSC have their own profilers through their inspectors.

## Sources

Code: `src/qjs/`, `src/gl/webgl_js.cpp`, `src/main.cpp:1271-1308` and `1591-1663`, `src/cli_core.cpp:321-357`, `src/tc/tc.h`, `src/tc/tuf.h`,
`src/tc/selfupdate.cpp`, `CMakeLists.txt:445-495` and `732-757`. Web (2026-10-21): [jsi.h](https://github.com/facebook/react-native/blob/main/packages/react-native/ReactCommon/jsi/jsi/jsi.h),
[node-api-headers](https://github.com/nodejs/node-api-headers), [node-addon-api](https://github.com/nodejs/node-addon-api),
[BabylonJS/JsRuntimeHost](https://github.com/BabylonJS/JsRuntimeHost), [NativeScript/napi-android](https://github.com/NativeScript/napi-android),
[microsoft/node-api-jsi](https://github.com/microsoft/node-api-jsi), [Margelo on JSI cost](https://margelo.com/blog/make-jsi-run-faster),
[oven-sh/WebKit](https://github.com/oven-sh/WebKit/releases), [rusty_v8](https://github.com/denoland/rusty_v8/releases),
[kuoruan/libv8](https://github.com/kuoruan/libv8), [chromiumdash](https://chromiumdash.appspot.com/),
[Debian webkit2gtk](https://sources.debian.org/src/webkit2gtk/), [allow-jit](https://developer.apple.com/forums/thread/674497).
