# Other JS engines for Zinc: JavaScriptCore, V8, LibJS (and the rest)

Status: research only, nothing implemented. Date 2026-09-30. Tags: **[V]** verified here (read code or ran it), **[W]** from a web source (linked), **[I]** inference or estimate. Effort figures are one strong developer, unvalidated.
Prior context: [README.md](README.md), [quickjs-jit-aot.md](quickjs-jit-aot.md), [threejs-webgl.md](threejs-webgl.md).

## 0. Verdict

1. **Build a small `zinc-js-engine` C++ interface, then support exactly two engines: QuickJS-ng (default, everywhere, the only one that works on iOS/ESP32-adjacent/rpi1) and JavaScriptCore (macOS/iOS system framework, plus JSCOnly on Linux arm64/x64 as an experiment).** V8 is the third, opt-in, desktop/server-only engine and only if JSC-on-Linux fails. LibJS is not viable today.
2. **The speed gap is real and JSC closes it.** Measured here (M-series Mac, same kernels as the earlier reports): Three r186 mock-GL render of 500 cubes is 13.2 ms in quickjs-ng, **0.54 ms in JSC (JIT)**, 0.81 ms in V8/node, **6.8 ms in JSC with JIT off**, 5.8 ms in V8 `--jitless`. Even the no-JIT modes of JSC and V8 are ~2x faster than QuickJS on Three's code. That matters for iOS, where no engine gets a JIT.
3. **iOS: JIT is not available to any in-process engine, JSC included.** In-process `JSContext` runs without JIT [W: Apple DTS reply, [forums 746159](https://developer.apple.com/forums/thread/746159)]; WKWebView has JIT but is out of process; BrowserEngineKit's JIT protection is EU browsers only. So on iOS the choice is between interpreters: JSC LLInt (free, system-provided, 0 bytes), QuickJS (+AOT from the earlier report), or V8 jitless (~+20 MB [I]).
4. **The current ABI cannot do zero-copy.** `zinc_abi.h` v4 says BYTES are readonly snapshots and adapters copy. WebGL/Three needs typed-array views onto native memory. That needs an ABI v5 addition (section 4), independent of the engine choice.

## 1. Measurements run for this report [V]

Machine: Apple M-series Mac, macOS 24.6, node v24.14 (V8 13.6.233.17-node.41), quickjs-ng build in the scratchpad (`bench/qjs_ng`, 1.09 MB), Apple `jsc` at `/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc`. Kernels: `scratchpad/bench/{fib,mandel,objs}.js` (fib(32); 300x300 mandelbrot; 200k `new P` plus string/object churn). Single run each, warm machine, differences under about 15% are noise.

| Kernel (ms) | quickjs-ng | JSC (JIT) | JSC `useJIT=0` | V8 (node) | V8 `--jitless` |
|---|---|---|---|---|---|
| fib(32) | 270 | 19 | 170 | 23 | 216 |
| mandelbrot | 380 | 18 | 148 | 14 | 225 |
| objects/strings | 49 | 13 | 29 | 8 | 18 |

Three r186 (esbuild bundle, mock GL Proxy, `scratchpad/thr/r.js`), ms per frame:

| Scene | quickjs-ng | JSC (JIT) | JSC no JIT | V8 (node) | V8 `--jitless` |
|---|---|---|---|---|---|
| 500 cubes, 351 draws, 2119 GL calls | 13.17 | 0.54 | 6.76 | 0.81 | 5.81 |
| 1000 cubes, 851 draws, 5119 GL calls | 28.99 | 1.09 | 16.07 | 2.20 | 13.47 |

Process footprint for `print(1)`: JSC 7.2 MB RSS, node 44.8 MB, quickjs-ng 2.1 MB; wall startup: JSC and QuickJS under 10 ms, node ~30 ms [V]. JSC on macOS costs 0 bytes of app size (system framework) [V: `du` reports 0B because it is in the dyld shared cache]. node is 119 MB, bun (JSC based, also with its own runtime) 61 MB [V, file sizes].
Caveats: `jsc` shell has no Zinc bindings; the mock GL crossing is a JS function, so native-crossing cost per engine is not measured; the JSC-no-JIT run still uses LLInt with its own assembly fast paths, so it is stronger than a naive interpreter; V8 `--jitless` on node still has embedded builtins compiled natively.

Published numbers [W]: V8 jitless is about 40% slower on Speedometer 2.0, 80% on Web Tooling, 6% on a real YouTube app, heap -1.7% ([v8.dev/blog/jitless](https://v8.dev/blog/jitless)). LibJS moved Speedometer 3 from 4.11 to 4.22 in one April 2026 optimisation ([newsletter](https://ladybird.org/newsletter/2026-04-30/)), i.e. it is far behind V8/JSC. Hermes reports vs QuickJS only as charts, no numbers extractable ([Static Hermes report](https://github.com/facebook/hermes/blob/static_h/doc/blog/2025-07-15-static-h-performance-june-2025.md)). weval on SpiderMonkey/Octane: 2.17x geomean vs its interpreter ([Fallin, PLDI 2025](https://cfallin.org/pubs/pldi2025_weval.pdf)).

## 2. Comparison matrix

| | QuickJS-ng (baseline) | JavaScriptCore | V8 | LibJS (Ladybird) |
|---|---|---|---|---|
| Licence | MIT | LGPL-2 / BSD-2 (WebKit JSC is BSD-2 with LGPL parts in WTF/JSC sources [I: check per-file]) | BSD-3 | BSD-2 [W] |
| Size added | ~1 MB [V] | 0 on Apple (system). JSCOnly `libJavaScriptCore` + ICU: order 15-30 MB with JIT, less stripped/no wasm [I, not built] | ~20-30 MB monolith; +ICU data [W: user brief, v8-builder README] | Unknown; plus Rust runtime and AK/LibGC, order of a few MB [I] |
| Build | one C amalgam, CMake [V] | Apple: none. JSCOnly: WebKit tree, CMake, Ruby/Perl/Python, ICU, ~1 h+ builds, several GB RAM [W: [trac JSCOnly](https://trac.webkit.org/wiki/JSCOnly)] | depot_tools/gn/ninja, huge checkout; `v8-cmake` community and `rusty_v8` prebuilt static libs [W] | CMake, **Rust now mandatory** [W: April 2026 newsletter], mimalloc, no stable library packaging [I] |
| C/C++ embedding API | Good C API, `JSValue` refcounted, opaque | **C API** (`JSObjectRef`, `JSValueProtect`) stable, small, with `JSTypedArray.h` incl. `JSObjectMakeTypedArrayWithBytesNoCopy`, `JSObjectMakeArrayBufferWithBytesNoCopy`, `JSObjectGetTypedArrayBytesPtr` [V: local SDK header]. ObjC `JSContext` on Apple | C++ only, unstable across versions, handles/scopes/isolates/contexts, heavy | C++ classes (VM, Realm, Value), no stable API, not designed to be embedded outside Ladybird [I] |
| ES level | ES2023+ | ES2025 (full) | ES2025 (full) | 97.8% test262 [W] |
| JIT tiers | none (interp; AOT prototype) | LLInt, Baseline, DFG, FTL (+ BBQ/OMG for wasm). `JSC_useJIT=0` = LLInt only [V] | Ignition, Sparkplug, Maglev, TurboFan; `--jitless` = Ignition only [W] | none by design: "not convinced" of JIT complexity; hand-written asm bytecode interpreter [W] |
| iOS | yes (interpreter, AOT possible) | Framework: yes, **no JIT in-process** [W]. WKWebView has JIT (out-of-process) | Only jitless (`v8_enable_lite_mode`), builds for iOS [W: [v8.dev/docs/cross-compile-ios](https://v8.dev/docs/cross-compile-ios)] | Not practical [I] |
| Android | yes | Not shipped by Android; JSCOnly builds exist (React Native used jsc-android in the past [I]) | Yes (Chromium/Node), big | Not practical [I] |
| Linux arm64 (Pi 4/5, rMPP) | yes [V, already builds] | JSCOnly supports ARM64 and ARMv7 with JIT [W: trac JSCOnly]; not built here | Yes, arm64 supported; Pi 3B+ 1 GB RAM is tight [I] | Builds in principle, immature [I] |
| Pi 3B+ (aarch64 userland) | yes | possible but heavy, untested | poor fit (RAM, size) | no |
| ESP32 | no (mquickjs/Duktape only, see report) | no | no | no |
| Windows | yes | JSCOnly Windows port exists but rarely used [I]; Bun ships JSC on Windows [I] | Yes, first-class | Not a focus |
| Wasm in engine | none | yes (BBQ/OMG, JIT-less IPInt) | yes (Liftoff/TurboFan; jitless disables wasm [W]) | no |
| ArrayBuffer zero-copy | `JS_NewArrayBuffer(..., free_func)` and `JS_GetArrayBuffer` [V: earlier report] | `...NoCopy` with deallocator callback and `GetTypedArrayBytesPtr` [V header]. Bytes must not move: JSC never moves ArrayBuffer backing stores | `ArrayBuffer::NewBackingStore` with custom deleter; external memory OK | ByteBuffer is AK-owned; native pointer exposure would need patches [I] |
| GC / handles | refcount, deterministic; `JS_DupValue/FreeValue` | Conservative stack scanning: C++ locals are safe, only heap-stored `JSValueRef` need `JSValueProtect` | Precise, moving; `Local<>`/`Global<>` handle scopes; embedder heap tracing (cppgc) for wrappers | GC (LibGC, conservative, mark-sweep) [W] |
| Startup / RSS | 2 MB, ~ms [V] | 7 MB, ~ms [V] | 45 MB (node); bare isolate 10-20 MB w/ snapshot [I]; snapshots give fast start [W] | unknown |
| Perf vs QuickJS (Three, mine) | 1x | **24x** (JIT), 2x (no JIT) [V] | 16x (JIT), 2.3x (jitless) [V] | slower than V8; QuickJS-comparable or slower [I] |
| Interrupt / timeout | `JS_SetInterruptHandler` (Zinc uses it) | `JSContextGroupSetExecutionTimeLimit` (private-ish on some builds, in `JSContextRefPrivate.h`; check) [I] | `Isolate::TerminateExecution` from another thread | no |
| Memory limit | `JS_SetMemoryLimit` (Zinc: 512 MiB) | none in public API; `JSC_maxHeapSize`-style options in JSCOnly, process-level otherwise [I] | `ResourceConstraints`, near-heap-limit callback | no |
| Maturity/activity | active (ng) | very active (Apple) | very active | active but browser-coupled, mid-rewrite to Rust (Feb 2026) [W] |

Other engines, briefly:

| Engine | Verdict | Notes |
|---|---|---|
| Hermes / Static Hermes | Skip | Bytecode-precompiled, no full ES (no `with`, limited Proxy history [I]), C++ JSI API not C, Intl optional. Faster than QuickJS on startup, JIT only in the experimental v2 ("hv32+jit", [W]). Useful precedent for iOS OTA bytecode. Build via CMake is OK. Would be a serious QuickJS alternative only for RN-style apps |
| Boa (Rust) | Skip | 94.12% test262 (v0.21) [W], slow, Rust FFI, no zero-copy story |
| Kiesel (Zig) | Skip | Learning project, Zig [W] |
| Duktape / mujs | Skip except tiny | ES5, 187 kB / 78 kB RAM Duktape [W]; mquickjs already the tiny plan |
| SpiderMonkey/mozjs | Skip | Excellent JIT, but Mozilla build (Rust, python, mozbuild), 20+ MB, C++ JSAPI; only worth it via weval/StarlingMonkey |
| QuickJS in Wasm / wasmtime + weval | Interesting, not now | Isolation and iOS-legal only via wasm interpreter (no AOT artifacts on iOS per `ios-core-runtime.md`); weval gives ~2.2x on SpiderMonkey PBL [W]; QuickJS-in-Wasm is slower than native QuickJS. Zero-copy is available (linear memory) but everything is inside Wasm's memory model, which suits a Wasm-hosted WebGL less than native GLES |

## 3. What each engine means for Zinc's QuickJS runner [V read of `runtime/vm/quickjs.cpp`]

The runner (333 lines) does the following engine-specific work, which is what a `zinc-js-engine` interface has to cover:

| Concern | QuickJS today | JSC | V8 |
|---|---|---|---|
| Module registry: `zinc:*` native modules with `JS_NewCModule`, `JS_NewCFunctionData` per export id | native module with synthetic exports | **No C API for ES modules** (`JSScript` / `JSModuleLoader` exist in the ObjC API only, macOS 10.15+; on JSCOnly, use `jsc`'s internal `moduleLoader` hooks). Simplest: bundle to one script and expose modules as a global `__zincModules` object | `Module::CreateSyntheticModule` plus `InstantiateModule` (clean) |
| emit-js output is ES2022 modules | evaluated as `JS_EVAL_TYPE_MODULE`, loader resolves files | Needs either ObjC `JSContext evaluateJSScript` with `JSScriptTypeModule` (Apple only) or a transform "ESM to script" in the compiler (esbuild-style; `zinc bundle`). Zinc's emitter already emits one module tree so a one-file IIFE mode is cheap | full modules |
| Native call: convert args (string, i32, f64, callback, resource) then `Modules::call` | per-arg `JS_ToInt32` etc. | `JSValueToNumber`, `JSStringCopyUTF8CString`; fine | `Local<Value>` -> `Int32Value`, `String::Utf8Value`; fine |
| Resources: JS object wrapping `ZincHandle` with finalizer that calls `resource_release`; cache `handle -> JSValue` weak | class with finalizer, non-owning map | `JSClassCreate` with `finalize`; **weak map from handle to object must not hold strong refs** (`JSObjectMake` + private data; use `WeakRef`-style via JS side map or recreate wrappers) | `Global<>` with `SetWeak` callback; cppgc |
| Guest callbacks `ZincCallback` holding `JSValue fn` and re-entering | `JS_DupValue`, `JS_Call` | `JSValueProtect`/`Unprotect`, `JSObjectCallAsFunction`; exceptions via `JSValueRef*` out-parameters (no longjmp) | `Global<Function>`, `Function::Call` with `TryCatch` |
| Microtasks: `JS_ExecutePendingJob` loop, pumped by the runner and in native callbacks | explicit | **JSC runs the microtask queue automatically at the end of each outermost API call** (`JSObjectCallAsFunction`/`JSEvaluateScript`). There is no public "run one job" in the C API. Order-of-effects compared to QuickJS may differ, breaking byte-exact parity tests in `tests/engines/run.mjs` in rare cases [I] | `MicrotasksPolicy::kExplicit` + `PerformCheckpoint()` (best control) |
| Timers/event loop: runner owns the loop (`h.timers`, `poll_host`) | Zinc-owned; bootstrapped `setTimeout` in JS | engine-neutral, reuse as is | same |
| Rejection tracker | `JS_SetHostPromiseRejectionTracker` | no C API; ObjC `JSContext` exposes none either. `unhandledrejection` must be emulated by wrapping `Promise` or polling, or use internal API in JSCOnly [I] | `SetPromiseRejectCallback` |
| Timeouts: `JS_SetInterruptHandler` deadline | poll callback | `JSContextGroupSetExecutionTimeLimit` with `shouldTerminateCallback` [I: SPI in `JSContextRefPrivate.h`, present in Apple SDK headers of the JSC framework? check `grep TimeLimit` returned only a doc mention of the context group, so it is likely SPI; verify] | `TerminateExecution` from a watchdog thread |
| Memory limit: `JS_SetMemoryLimit(512 MiB)` | built-in | none; rely on `setrlimit`/Zinc's own resource accounting; or JSC options in JSCOnly | `ResourceConstraints` |

Conclusion: the ABI side (`zinc_abi.h`) is engine-neutral and reusable unchanged, since no engine value crosses it [V]. What must be abstracted is a "JS host" trait of about 15 operations (section 5), not the ABI.

## 4. Zero-copy and the ABI (crucial for WebGL/Three.js)

`zinc_abi.h` v4 comment: "BYTES are readonly value snapshots: adapters copy inputs and outputs; no alias identity or native mutation is exposed", and NUMBERS are read-only `double[]` arguments only [V]. In `quickjs.cpp` a `u8[]`/`number[]` argument is rebuilt by walking a JS **Array** element by element and pushing into a `std::vector` (lines about 140-165) [V]. That is O(n) with per-element `JS_GetPropertyUint32`, a typed array would not even be accepted (`JS_IsArray`). So today even `bufferData` with a `Float32Array` is impossible.

Needed (engine-neutral) ABI v5 addition, prototype:

- `ZINC_TYPED_VIEW` argument type: `{ void* data; uint32_t byte_length; uint8_t elem_kind; uint8_t writable; }`, borrowed for the duration of `invoke`; same borrowing rule as strings. All three engines can give a pointer to an `ArrayBuffer` backing store:
  - QuickJS: `JS_GetArrayBuffer` / `JS_GetTypedArrayBuffer` [V: earlier report].
  - JSC: `JSObjectGetTypedArrayBytesPtr` + `JSObjectGetTypedArrayByteOffset/Length` (JSTypedArray.h) [V].
  - V8: `ArrayBufferView::Buffer()->GetBackingStore()->Data()` plus `ByteOffset()`.
- `ZINC_NATIVE_BUFFER` result: native-owned memory exposed as an ArrayBuffer without copy (`JS_NewArrayBuffer` with free func; JSC `JSObjectMakeArrayBufferWithBytesNoCopy` with `JSTypedArrayBytesDeallocator`; V8 `ArrayBuffer::NewBackingStore(data, len, deleter)`). Needed for `mapBufferRange`/readPixels-style APIs and for shared `Float32Array` staging arenas.
- Rule: native code must not retain the pointer after `invoke` returns (GC and detach), matching the current "borrowed for the duration of invoke" contract.

Effort: 4-6 days for ABI, `abi.ts` and the QuickJS adapter plus tests; +2-3 days per further engine. This is the highest-value change in this whole report and it helps QuickJS as well.

## 5. Proposed abstraction: `zinc-js-engine`

Keep it a compile-time (template or link-time) interface, not a virtual hierarchy per value; runner main loop (timers, `poll_host`, deadline, exit code, `zinc::RunnerHost`, module registry, resources) is engine-neutral and extracted once from `quickjs.cpp` (about 120 of the 333 lines).

```
struct JsEngine {                      // one implementation per engine, chosen at build time
  bool init(const Limits&);            // memory, stack size
  bool defineHostObject(name, table);  // __zincHost: write, timer, now, exit, env ...
  bool registerNativeModule(name, const ZincModule*);   // synthetic module or global fallback
  bool evalMain(path, source);         // ESM main (or IIFE bundle on JSC without modules)
  int  runMicrotasks();                // >0 progress, 0 none, <0 exception
  bool call(Fn, args...);              // for timers and ZincCallback
  ZincHandle makeCallback(Fn);         // ref-hold; released via resource_release
  void  setInterrupt(deadline);
  void  reportError(ex);               // uniform stderr format so tests stay byte-exact
  void  setRejectionHook(cb);
};
```

Marshalling code (args to `ZincValue`, results back) is generated per engine from the same descriptor table (`ZincExport`), so the ~120 lines of conversion in `nativeCall` get one implementation per engine but no logic change. New files: `runtime/vm/jsengine.h`, `runtime/vm/js_quickjs.cpp` (moved code), `js_jsc.cpp`, later `js_v8.cpp`. CLI: `--engine quickjs|jsc|v8` reuses the existing `engines.ts` per-engine build directories and `engine.json` fingerprint. Parity harness `tests/engines/run.mjs` adds modes `jsc` and `v8` (byte-exact stdout vs native/VM/QuickJS), which is the correctness gate.

Module loader: keep emit-js as ES2022 modules for QuickJS/V8; for JSC add a `--js-format iife` bundler step (one-file, `zinc:*` imports rewritten to `__zincModules["zinc:x"]`), which also removes file I/O from the runner and suits iOS bundles. Event loop: unchanged (Zinc-owned). Timeouts: interrupt/terminate per table in section 3. Memory limit: enforced in Zinc's ABI allocations (already 64 MiB composite cap) plus process rlimit for JSC.

## 6. Fit for Three.js / WebGL per platform

| Platform | Practical engine | Rationale |
|---|---|---|
| macOS (dev, Studio) | **JSC (system, JIT)** | 0 bytes, 24x faster than QuickJS on Three [V]. Hardened-runtime apps need `com.apple.security.cs.allow-jit` for JIT [I]; the `zinc` CLI is unsandboxed so fine |
| iOS | **QuickJS(+AOT) or JSC-in-process, both no JIT** | JSC LLInt is 2x QuickJS on Three [V] and free, but Apple's rule forbids any JIT [W], and JSC C API pieces (rejection tracker, modules) are missing. Zinc VM stays chosen path for app logic; Three is the exception, which is why JSC no-JIT is the pragmatic engine there. Precompiled bytecode is not available in JSC's public API [I], so JS ships as source (App Review has accepted JSC-hosted JS: Scriptable, per `ios-core-runtime.md`) |
| Linux x64 desktop / Windows | **V8 or JSCOnly** | V8 is the least risky for Windows; JSCOnly is smaller but Windows port is niche [I]. Choose after a spike |
| Pi 4/5 (aarch64) | **JSCOnly (JIT, arm64)** as experiment; QuickJS as baseline | Pi 4 Cortex-A72 is ~3-5x slower than M1 [I], so QuickJS Three would be 40-100 ms/frame for 500 cubes: unusable. JSC with JIT should be ~2-5 ms [I]. V8 arm64 works but 1-2 GB RAM boards suffer |
| Pi 3B+ (1 GB, aarch64 userland) | JSC no-JIT or QuickJS, small scenes only | V8 no; JSCOnly build must be cross-compiled (zig/sysroot), ~[I] 20 MB RSS baseline |
| rM Paper Pro (arm64 Linux, e-ink) | QuickJS | UI is low-frame-rate; Three not a target |
| Android | QuickJS (or V8 if NDK build is accepted) | no system JSC; skip until asked |
| ESP32 | mquickjs / Zinc VM | out of scope of this report |

Cost model to remember: the earlier report found the crossing is not the bottleneck and this report confirms that Three's own JS is. So a JIT engine on desktop/Pi-class targets is the lever; on iOS the lever is Three's own batching (InstancedMesh/BatchedMesh) plus JSC LLInt.

## 7. Phased plan (one developer)

| Phase | Work | Effort | Exit gate |
|---|---|---|---|
| 0 | Extract engine-neutral runner from `quickjs.cpp` into `jsengine.h` + QuickJS impl; no behaviour change | 4-6 d | `tests/engines/run.mjs` unchanged pass |
| 1 | ABI v5: typed-array view/native buffer + tests (all 3 sides) | 4-6 d | zero-copy round-trip test on QuickJS |
| 2 | `js_jsc.cpp` on Apple (C API + ObjC `JSScript` modules or IIFE bundle), `--engine jsc`, parity matrix, bench harness with the kernels above | 10-15 d | byte-exact parity; Three mock bench under Zinc <= 1 ms/500 cubes |
| 3 | JSCOnly cross-build for aarch64 Linux (Pi 4/5), zig/sysroot recipe, CI artefact caching (build once, ship prebuilt static lib in `zinc toolchain`) | 15-25 d | runs Phase 2 tests on a Pi 4; RSS/size measured |
| 4 | Windows/Linux x64: try JSCOnly first (reuse Phase 3 recipe); only if it fails, `js_v8.cpp` on prebuilt static libs (rusty_v8/`v8-cmake`) | 10 d (JSCOnly) / 20-30 d (V8) | same tests |
| 5 | Optional: precompiled-bytecode/snapshot for V8, embed Three preset, docs | 5-10 d | n/a |

Total for JSC macOS + Pi: about 35-55 days, V8 as extra: +20-30 days. LibJS: no phase; revisit in 12+ months.

## 8. Risks

- **JSC portability (highest):** JSCOnly is real and builds on ARM64/ARMv7 [W], but WebKit build time, size and toolchain (ICU, Ruby/Perl/Python, compilers new enough) are uncertain for cross-builds to Pi; JIT on ARMv6 (rpi1) is impossible, so rpi1 stays QuickJS. Not built in this session.
- **JSC API gaps:** no C-level modules, microtask control, rejection tracker or supported execution time limit; each needs a workaround and may cause parity differences from QuickJS.
- **iOS policy:** rules can change; today, in-process JSC has no JIT [W] and BrowserEngineKit JIT is EU-browser only. JSC as an *only* engine for iOS Zinc apps would need a fallback to QuickJS.
- **V8:** 20-30 MB, `gn`/depot_tools or third-party prebuilts (rusty_v8 static libs are large and versioned per Rust crate), C++ API churn every release; not viable on Pi 3B+, on iOS only as jitless.
- **LibJS:** `test262` 97.8% is good, but no JIT by design, no stable embedding API, C++/Rust mix with Rust mandatory since April 2026, tightly coupled to Ladybird build, slower than V8/JSC (Speedometer 3 about 4.2 [W] vs. browsers in the 20-40 range [I]). Only useful as a curiosity.
- **Parity drift:** microtask timing, error message text, property enumeration order, float formatting differences between engines can break byte-exact tests; add a normalisation layer only where the ECMAScript spec allows variation.
- **Licences:** JSC is LGPL/BSD mixed [I: verify per-file]; dynamic linking on Apple is fine, static linking on Linux needs a license review against `docs/licenses.md` (MIT-only for engines).

## 9. AOT-friendly for iOS (what remains)

- Zinc VM (typed bytecode, tail-call threaded interpreter) and Zinc->C++ AOT stay the primary iOS path; both are engine-free.
- QuickJS: precompiled bytecode (`JS_WriteObject`) and `qjsc -A` AOT ported to ng are iOS-legal because they are linked at build time [V: earlier report]; JSC and V8 give no such AOT (JSC bytecode cache is private; V8 code cache needs a matching build and jitless still interprets).
- JSC in-process (LLInt) is legal on iOS and is the fastest no-JIT engine tested here [V], but ships JS as source; V8 jitless is legal, larger.
- Rule from `docs/reports/ios-core-runtime.md`: no downloaded dylibs/machine code/wasm AOT artefacts; OTA is interpreted bytecode or source only.

## 10. Not verified

Not built: JSCOnly, V8 monolith, LibJS, Hermes, mozjs, quickjs-in-wasm+weval. All sizes for those are estimates. `JSContextGroupSetExecutionTimeLimit` availability on public headers was only partially checked (grep found the context-group API but not the time-limit declaration in public headers). BrowserEngineKit details come from an Apple DTS forum reply, not the App Store guidelines text; re-read App Review Guideline 2.5.2 and the JIT entitlement docs before committing to a strategy. LibJS embedding conclusions are inferred from the newsletter and repository structure, not from building it. The Three mock bench measures JS-side cost only.

## Sources

- Apple DTS thread: https://developer.apple.com/forums/thread/746159
- V8 jitless: https://v8.dev/blog/jitless ; V8 iOS cross-compile: https://v8.dev/docs/cross-compile-ios
- Ladybird April 2026 newsletter (LibJS 97.8% test262, Rust mandatory, no-JIT stance): https://ladybird.org/newsletter/2026-04-30/ ; results: https://ladybirdbrowser.github.io/libjs-website/test262/
- JSCOnly: https://trac.webkit.org/wiki/JSCOnly ; https://github.com/WebKit/webkit/blob/main/Source/cmake/OptionsJSCOnly.cmake ; cross-build https://trac.webkit.org/wiki/JSCOnly/CrossBuildAndRemoteTestJSCLinux
- Hermes: https://github.com/facebook/hermes/blob/static_h/doc/blog/2025-07-15-static-h-performance-june-2025.md
- Boa: https://github.com/boa-dev/boa ; https://lobste.rs/s/upi3xa/boa_release_v0_21_new_release_boa
- Kiesel: https://kiesel.dev/ ; Duktape/mujs sizes: https://www.x-cmd.com/install/duktape/
- weval: https://cfallin.org/blog/2024/08/28/weval/ ; https://cfallin.org/pubs/pldi2025_weval.pdf
- Local: `runtime/include/zinc_abi.h`, `runtime/vm/quickjs.cpp`, `docs/reports/ios-core-runtime.md`, macOS SDK `JavaScriptCore.framework/Headers/JSTypedArray.h`; bench inputs in the session scratchpad (`bench/`, `thr/r.js`).
