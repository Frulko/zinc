# Hermes and Static Hermes for Zinc: a fourth engine, and a compiler?

Study, 2026-10-21. Question (owner): analyse integrating Hermes, now that it can compile ahead of time ("Static Hermes", Hermes V1, the
`shermes` compiler). Context: Zinc runs plain JavaScript on QuickJS-ng (default), JavaScriptCore (`--engine jsc`) and V8 (`--engine v8`), all
bound through Node-API and loaded as `libzn_engine_<name>.dylib` packs (`docs/reports/js-engines-jsc-v8.md`, `include/zn/engine.h`,
`src/engine/driver.cpp`), next to Zinc's own typed AOT (SSA IR to C++).

Method: the facebook/hermes repository (branch `static_h`, read through the GitHub API on 2026-10-21), the React Native blog, npm, and the
repository's own reports. Everything not marked "estimate" or "not verified" was read in a source cited inline. No code was built or run:
the numbers for Hermes below are the project's or third parties', not measured here.

## Summary

- Hermes is a mature, MIT-licensed engine (React Native's default since 0.70, **Hermes V1 the default since RN 0.84, February 2026**). It is a
  **bytecode VM**: its strengths are start-up, a compact heap and precompiled bytecode (`.hbc`); its weaknesses for Zinc are no ES modules,
  no WebAssembly, no `Symbol.species`, no local `eval`, `Intl` only through the OS on Apple and Android, and a JIT that exists but is arm64 only.
- The finding that changes the cost: **the `static_h` branch now ships a Node-API v10 implementation of its own** (`API/napi`, built on the
  VM internals, not on JSI; a `hermesNapi` CMake target; tests from Node and the node-api CTS). The binding work that dominated V8 and JSC is
  mostly already done upstream: a `--engine hermes` pack is a small adapter of the kind of `src/engine/v8.cpp` (199 lines).
- **Static Hermes, the typed ahead-of-time compiler, is not shippable for Zinc**: the repository itself calls it "in progress and considered
  unstable", its type system is Flow-based (TypeScript only partly, converted to Flow), exact objects and nominal classes, and no benchmark of
  typed code against V8 has been published that I could find. It does not replace or complement Zinc's AOT.
- Recommendation: do not make Hermes a supported engine now; run a **half-day spike** behind the existing engine interface (reversible, §4 of
  `RULES.md`), keep the decision on measured numbers; never use `shermes` as a compiler for Zinc code.

## Measured verdict (ZN-773.07 spike, 2026-10-21)

The spike was done; the numbers are in `docs/reports/zinc-next-perf.md`, "Hermes and Static Hermes beside the three engines".

What was built: `tools/hermes-pack` builds `static_h` at `e760a68a` from source into `~/.zinc/sdk/hermes/<commit>` (about 3 minutes at `-j4` on the
M1 Pro); `tools/hermes-patches/zinc-embed.patch` adds four C entry points to `libhermesvm` (a Runtime with its microtask queue and its Node-API env,
the job drain, an optimised or lazy compile with a name, and the run of a Static Hermes unit) and makes the Promise polyfill's rejection tracker
report at once instead of after a 2 s timer; `src/engine/hermes.cpp` (about 100 lines) is the adapter; `tools/engine-pack hermes` makes a 1.8 MB
pack; `tools/hermes-unit` compiles a program's bundle with `shermes` into a library the same module runs in place of the source.

What runs: `tests/t0/jsc.sh hermes` (all checks: goldens, exceptions, top-level await, unhandled rejections, zinc:gfx frames, WebGL),
`tests/golden/run/native_callbacks.ts`, `examples/hero`, `js-three` (WebGL), `js-pixi`, `js-phaser`, `js-p5`, `js-gsap`, `js-anatomy`: frame 30 or
60 pixel-identical to QuickJS on every one. Hero also runs as Static Hermes native code, pixel-identical. Two fixes were needed: the adapter keeps
a handle scope open for the whole run (Hermes's env marks no slot without one: hero crashed in the first young collection), and `webenv.js`'s
`import()` for module scripts goes through `new Function` (Hermes has no `import()` syntax and compiles functions lazily, so the whole
`runScript` failed to parse at its first call). Module scripts, WebAssembly and an inspector stay absent on Hermes.

What it measured (M1 Pro, loaded machine):

| | QuickJS-ng | JSC | V8 | Hermes | Static Hermes |
|---|---|---|---|---|---|
| host call | 70 ns | 115 ns | 52 ns | **50 ns** | 48 ns |
| fib(30) | 75 ms | 5 ms | 8 ms | 32 ms (19 with `-O`, 83 without JIT) | 21 ms |
| hero, 600 frames CPU | 1.04 s | 0.94 s | 0.53 s | 0.89 s | 0.67 s |
| hero footprint | 50 MB | 140-160 MB | 77-86 MB | 67-74 MB | 51-58 MB |
| empty program | 5.7 MB, 10-20 ms | 9.9 MB, 20-30 ms | 20 MB, 30-40 ms | 8.5 MB, 20-30 ms | |
| UI scenes of zbench | 1.5 to 3.7 ms | 0.6 to 1.3 | 0.6 to 0.7 | 0.8 to 3.2 | |
| zbench image_update (256 KB array to a host row) | 15.4 ms | 2.4 | 4.1 | 5.4 (26.8 before `new T(n).set(a)`) | |
| download | built in | none (system) | 74 MB of libraries | 1.8 MB pack | + the program's code (4.9 MB for hero) |

Verdict:

- **Hermes as an engine: keep, experimental, not published.** It is the cheapest engine to carry (upstream Node-API, a 100-line adapter, a 1.8 MB
  pack, MIT) and the fastest host call of the four; it beats QuickJS by 1.1 to 2.3x on JavaScript with about 20 MB more memory, and never comes
  near V8 or JSC on the desktop (2 to 6x slower on fib and allocation, QuickJS's speed on the UI scenes). On a Mac it brings nothing V8 or JSC
  do not do better, so no pack goes into the signed index now; `--engine hermes` stays for source builds (`tools/hermes-pack`, then build).
  It becomes worth publishing for a target where no JIT is allowed and no JSC exists (Android without V8, consoles), where its interpreter
  (fib 83 ms, objects 1.7x QuickJS's speed) and its start-up are the alternatives to QuickJS: that is the cross-platform pass.
- **Static Hermes: keep the tool, not a product feature.** Compiled ahead of time, hero starts 40% faster than on Hermes's bytecode, runs 1.3x
  faster and uses QuickJS's memory, and it is the only way here to native JavaScript where a JIT is forbidden (iOS, consoles). But the code
  grows 7x, a compile takes half a minute, untyped code gains little over Hermes's own JIT (21 ms against 19 ms on fib), and typed mode needs
  Flow types Zinc does not have. Zinc's own AOT stays the path for typed programs (it ties V8 on UI scenes); `tools/hermes-unit` is kept to
  measure again when an iOS or console JavaScript workload needs it.
- Not done in the spike, for a real pack: Hermes's CDP inspector behind `src/dbg/ws.cpp`, the licences of `libhermesvm`'s vendored parts in the
  pack (`llvh`, `dtoa`, `zip`...), `.hbc` precompiled at `zinc build`
  (`hermes_run_bytecode`), Linux and Windows builds. The first three were done by ZN-773.08 (below).

## The published pack, the inspector and bytecode (ZN-773.08, 2026-10-21)

The verdict above changed on one point: the pack is published, still experimental. At 2.0 MB it costs the index nothing, and a published pack
is what lets a user try Hermes, its inspector and its bytecode without building Hermes.

- **Pack.** zinc-next's build job builds Hermes (`tools/hermes-pack`, its SDK kept in an `actions/cache` keyed on the pin and the patch) and makes
  `engines/hermes/<version>/aarch64-macos.tar.xz` beside v8 and wasm; the test shards restore the same SDK. The pack's version is the date of
  the pinned commit (`VERSION` in `tools/hermes-pack`, 2026.10.21), since a commit hash does not order. `licenses/` carries Hermes's MIT licence
  and those of what is compiled into `libhermesvm`: llvh (LLVM, Apache-2.0 with LLVM exception), David Gay's dtoa, zip (Unlicense), asmjit
  (zlib, the JIT), boost.context (BSL-1.0), dragonbox (Apache-2.0-LLVM or BSL-1.0) and fast_float (MIT, Apache-2.0 or BSL-1.0); the notices of
  the header-only and single-file parts are their files' heads. `tests/t0/engine_pack.sh` makes the pack, signs it into a local index and runs
  `--engine hermes` from a zinc that has no module beside it.
- **Inspector.** Hermes is built with its debugger. The Runtime is now a `HermesRuntime` (JSI) whose VM runtime carries the Node-API env, so the
  CDP agent of `API/hermes/cdp` attaches to it; `zn_cdp.cpp` in the patch gives it C entry points (start, a message, the queued work, pause).
  `src/engine/hermes.cpp` serves it as `v8.cpp` serves V8's: target `zinc-hermes` on `src/dbg/ws.cpp`, the agent's work run at each drain and in
  the wait of `--inspect-brk` (while JavaScript runs or is paused, Hermes's debugger runs it itself), the console through a JSI function, the
  source map inline, the JIT off under the debugger. The target answers `Runtime.runIfWaitingForDebugger` and sends the execution context itself
  (the agent does neither). Hermes's agent sends no `hitBreakpoints`. `tests/t1/hermes_inspect.sh`: discovery, pause at start, `debugger`,
  evaluate on the frame, a breakpoint, a step, the console.
- **Bytecode.** `zinc build` of a project on `"engine": "hermes"` bundles it (`build/<name>.js`) and has the module compile it
  (`zn_engine_compile`, through the patch's `zn_hermes_compile`: no `hermesc` shipped, the compiler is the library's) to `build/<name>.hbc`;
  `zinc run build/<name>.hbc`, and an exported app (`app.hbc`), map it and run it through `hermes_run_bytecode`. Its frames carry the
  bundle's file name, which the driver maps through the source map: the traces name the user's files and lines as from source. Hero starts in
  280 ms instead of 440 to 525 (`zinc-next-perf.md`). The bytecode is version-locked to the VM: it is used only when it is not older than its
  bundle and its header has this VM's bytecode version (a pack updated since `zinc build` runs the source instead).

## 1. What Hermes and Static Hermes are today

| Fact | Value | Source |
|---|---|---|
| Repository | facebook/hermes, default branch `static_h` (last push 2026-10-21), MIT | [repo](https://github.com/facebook/hermes), [LICENSE](https://github.com/facebook/hermes/blob/static_h/LICENSE) |
| GitHub tags | last `v0.13.0` (2024-08-16); real releases are `*-stable` branches and npm packages | [tags](https://github.com/facebook/hermes/tags), branches `250829098.0.0-stable`, `260318099.0.0-stable` |
| npm `hermes-compiler` | `latest` 250829098.0.19 (legacy line), `latest-v1` **260318099.0.4**, `latest-v0` 0.17.0, nightly 0.18.0 | `npm view hermes-compiler dist-tags`, 2026-10-21 |
| Who ships it | React Native on iOS and Android; **V1 default since 0.84** (opt-in since 0.82) | [RN 0.84](https://reactnative.dev/blog/2026/02/11/react-native-0.84) |
| What "V1" is | the `static_h` VM (new compiler, VM, GC options) *without* the typed compiler; the Callstack talk states that V1 "isn't Static Hermes" | [Callstack](https://www.callstack.com/events/hermes-v1-what-it-is-what-it-isnt-and-whats-next) |
| Bytecode version | 99 in the 260318099 line (bumped from 98; prebuilt `.hbc` must be rebuilt) | [blog 2026-06-05](https://github.com/facebook/hermes/blob/static_h/doc/blog/2026-06-05-new-hermes-stable-release.md) |
| Modes | AOT to bytecode or to native; runtime: native, interpreter, lazy compile, baseline JIT; all mixable in one process | [blog 2025-11-02](https://github.com/facebook/hermes/blob/static_h/doc/blog/2025-11-02-hermes-compilation-runtime-modes.md) |
| JIT | exists in `lib/VM/JIT`, **arm64 only** (an `arm64` directory is all there is) | [lib/VM/JIT](https://github.com/facebook/hermes/tree/static_h/lib/VM/JIT) |
| Memory modes | HV64 (NaN-boxing), HV32 (32-bit values, up to 4 GB reserved block on 64-bit; 4 MB segments on iOS). V1 ships HV32 on Android, HV64 on iOS | [blog 2025-11-06](https://github.com/facebook/hermes/blob/static_h/doc/blog/2025-11-06-hermes-memory-modes.md) |

### What `shermes` compiles

`shermes` is the Static Hermes compiler driver ([tools/shermes](https://github.com/facebook/hermes/tree/static_h/tools/shermes)):

- Input: untyped JavaScript (the default), Flow-typed JavaScript with `-typed`, TypeScript type syntax with `-parse-ts` (converted to Flow, "partially
  supported"), or TypeScript with `--transform-ts` (erasable syntax only: no `enum`, `namespace`, parameter properties; this is type stripping, not
  type-driven compilation) ([TypedLanguage.md](https://github.com/facebook/hermes/blob/static_h/doc/TypedLanguage.md),
  [typescript-stripping.md](https://github.com/facebook/hermes/blob/static_h/doc/typescript-stripping.md)).
- Output: bytecode, generated C (`-emit-c`), an object file (`-c`), an executable (default `a.out`), or run at once (`-exec`); it links the
  Hermes VM (`hermesvm`, or the `-lean` VM; static or shared) and takes `-L`, `-l`, `-Wc,` for C libraries
  ([shermes.cpp](https://github.com/facebook/hermes/blob/static_h/tools/shermes/shermes.cpp)). So even "native" code needs the runtime library:
  untyped code compiled to C still runs on the VM's object model, with the interpreter's dispatch removed.
- Typed mode adds exact objects (no extra properties, fixed order), nominal classes, checked `Array<T>`, unions, tuples, `c_ptr`, and
  **FFI to C without a binding layer**: `$SHBuiltin.extern_c({include: "stdlib.h"}, function getenv(name: c_ptr): c_ptr { throw 0; })`
  ([examples/ffi](https://github.com/facebook/hermes/tree/static_h/examples/ffi), tested on macOS only, "not production quality").
- A compiler for Hermes itself in the browser also exists (`emhermesc`, [blog 2024-12-23](https://github.com/facebook/hermes/blob/static_h/doc/blog/2024-12-23-compiling-javascript-to-wasm.md): JS to Wasm), which is
  what some press calls "Hermes and Wasm"; it does **not** mean Hermes runs WebAssembly modules (see section 3).

### Maturity, honestly

- Bytecode VM (V1): production, on billions of devices through React Native. Mature.
- Untyped JS to C/native through shermes: works, relative speed-up over the interpreter is modest (Octane, static_h vs old Hermes:
  1.1x to 1.7x interpreter, 1.2x to 2.9x with JIT, up to 7.9x on type-inferable loops: [blog 2024-12-19](https://github.com/facebook/hermes/blob/static_h/doc/blog/2024-12-19-static-hermes-update-dec-2024.md)). Old numbers (2024).
- Typed mode: "in progress and considered unstable" in the project's own guide. Experimental.

## 2. Binding: Node-API on Hermes

Three routes existed; one is now the obvious one.

| Route | State | Verdict |
|---|---|---|
| **Hermes's own Node-API** (`API/napi`: `hermes_napi*.cpp`, `hermesNapi` target) | NAPI_VERSION 10, "all non-experimental APIs" ([COMPATIBILITY.md](https://github.com/facebook/hermes/blob/static_h/API/napi/COMPATIBILITY.md), [README](https://github.com/facebook/hermes/blob/static_h/API/napi/README.md)); on VM internals, not JSI; `napi_value` is a pinned slot in a handle-scope block; 31 unit-test files, ~65 Node tests vendored (33 pass, 31 skipped, 0 fail); typed arrays, DataView, BigInt, promises, type tags, async work, thread-safe functions (through a host interface we implement) | **use this** |
| BabylonJS/JsRuntimeHost Hermes backend | already named in our study (it lists Hermes among its engines) | fallback, over JSI |
| JSI (`hermes-engine` C++ API) | C++ virtual interface, no promise creation, no DataView | no (D-ABI choice stays Node-API) |
| microsoft/hermes-windows | a Windows fork of Hermes (MIT) for react-native-windows; does not document its own Node-API in its README; JSI is layered on Node-API through microsoft/node-api-jsi | not needed now that upstream has it ([hermes-windows](https://github.com/microsoft/hermes-windows)) |

Gaps against what Zinc's bindings use (all from COMPATIBILITY.md): external strings always copy (irrelevant); `napi_adjust_external_memory` does
not influence the GC (a concern for WebGL buffers and big ArrayBuffers: needs a check); external ArrayBuffers are supported. Not in Node-API and so
needed as engine services in the `zn_engine` interface: microtask drain after a host callback, unhandled-rejection hook, interrupt from another
thread, stack and heap limits, inspector, and the script-with-bytecode entry (`hermes_napi_compile.cpp` is the place to look). Hermes's Promise is
a **bytecode polyfill** (`lib/InternalJavaScript/01-Promise.js`), so job draining and rejection tracking go through its own queue
([Features.md](https://github.com/facebook/hermes/blob/static_h/doc/Features.md)): the `drain_microtasks` and rejection hooks need reading
Hermes's `HermesRuntime::drainMicrotasks` and the unhandled-rejection tracker, which React Native already uses.

Host-call cost (estimate, not measured): our table says Hermes's JSI host function costs ~27 ns and Node-API is within noise of JSI on Hermes
([NativeScript/runtimes#75](https://github.com/NativeScript/runtimes/pull/75), via `js-engines-jsc-v8.md`). Hermes's napi goes through a
`NativeConstructor` trampoline and handle-scope slots, comparable to our patched QuickJS path. Expect **40 to 100 ns** per `__host_*` row through
Node-API, i.e. between V8 (50) and JSC (118); QuickJS is 70. The hot rows would use the same generated direct path as the other engines if worth it.

## 3. Fit as a fourth pack, `--engine hermes`

### Comparison table

| | QuickJS-ng | JavaScriptCore | V8 | Hermes V1 (bytecode VM) | Static Hermes (`shermes`) |
|---|---|---|---|---|---|
| Zinc status | default, embedded | `--engine jsc`, system framework (macOS) | `--engine v8`, downloaded pack | none | none |
| Licence | MIT | LGPL-2.1 (shared) | BSD-3 | MIT | MIT |
| JIT | no | yes (entitlement) | yes | arm64 only, baseline | native code for typed/untyped AOT, arm64 JIT |
| Host call (measured / est.) | 70 ns | 118 ns | 50 ns | ~40-100 ns (est.) | direct C FFI (typed) |
| Footprint, `hero` | ~50 MB | ~140 MB | ~90 MB | est. 40-70 MB (HV32), not measured | n/a |
| ES modules | own loader | via `zinc bundle` | via `zinc bundle` | **none at runtime**, via `zinc bundle` | same |
| async/await, generators | yes | yes | yes | yes (async lowered to generators; async generators "not tested in production") | same |
| Proxy, Reflect | yes | yes | yes | yes (Proxy invariants fixed in 2026) | same |
| WebAssembly | wasm pack (ZN-773) | native | native | **no** (not found in the VM) | no |
| Intl | shim | native | native | Apple and Android: OS-backed, basic Collator/NumberFormat/DateTimeFormat; Linux/Windows: ICU only with `-DHERMES_ENABLE_INTL=ON`, off by default | same |
| Bytecode precompile | `.qbc` | none | code cache | **`.hbc`** (`hermesc`), version-locked to the VM | `.hbc` or native |
| Debugger | none | Safari Web Inspector | Chrome DevTools | CDP agent in `API/hermes/cdp`, tools `hcdp`, `hdb` | same VM |
| Spec gaps | few | few | none | no local `eval`, no `with`, no `Symbol.species`, mapped `arguments` absent, `Function.prototype.toString` has no source | same |

Sources for the Hermes columns: [Features.md](https://github.com/facebook/hermes/blob/static_h/doc/Features.md),
[SpecIncompat.md](https://github.com/facebook/hermes/blob/static_h/doc/SpecIncompat.md),
[IntlAPIs.md](https://github.com/facebook/hermes/blob/static_h/doc/IntlAPIs.md),
[BuildingAndRunning.md](https://github.com/facebook/hermes/blob/static_h/doc/BuildingAndRunning.md),
[lib/Platform/Intl](https://github.com/facebook/hermes/tree/static_h/lib/Platform/Intl), [API/hermes/cdp](https://github.com/facebook/hermes/tree/static_h/API/hermes/cdp),
and the 2026-06 release blog (Set methods, `Object.groupBy`, iterator helpers, `FinalizationRegistry`, `TextDecoder`, `Promise.try`, Unicode 17).
ES2015 to ES2022 syntax is complete (classes with private fields and static blocks, optional chaining, BigInt, named groups). WebAssembly: a code
search of the repository finds only the Emscripten tools and the CDP agent, so Hermes does not run Wasm; the RN 0.84 post does not mention it
(the Callstack event page does, which I could not confirm in a primary source:
[Callstack](https://www.callstack.com/events/react-native-0-84-and-other-news)).

### Build and platforms

- Build from source: CMake + Ninja, `cmake -S hermes -B build -G Ninja`; Windows with Visual Studio; Android through the NDK toolchain and a
  host-built compiler (`IMPORT_HOST_COMPILERS`); WASM through Emscripten; iOS and macOS are what React Native builds
  ([README](https://github.com/facebook/hermes), [CrossCompilation.md](https://github.com/facebook/hermes/blob/static_h/doc/CrossCompilation.md)).
  Dependencies are vendored (`external/`: llvh, asmjit, boost headers...), ICU optional. Licence of the vendored parts to check before a pack
  ships (llvh is LLVM-derived, Apache-2.0 with LLVM exception; asmjit zlib): `licenses/` in the pack, as the V8 pack does.
- Size of `libhermes`: not verified here. React Native's Android `libhermes.so` is a few MB per ABI (my recollection; estimate 2 to 4 MB, 5 to 8 with
  the compiler); the Node-API layer adds little. Against V8's ~30-60 MB pack and JSC's none, this is the smallest download of the engines that is not
  embedded, and small enough to link **into** `zinc` as QuickJS is (MIT: no obstacle), which would skip the pack machinery.
- Platforms in play: macOS arm64 and x86_64 (the engine packs are built and measured on Apple silicon, arm64, where the JIT exists; on Intel Macs Hermes is interpreter only), Linux, Windows, Android, iOS (the RN
  case, where JIT-less engines are the only option and Hermes is designed for it). This is a stronger story than V8 on iOS and consoles.

### Start-up and memory

- Design goal: fast start-up and low memory on mobile ([README](https://github.com/facebook/hermes)): bytecode is mmap'd, functions are lazily
  initialised, HV32 halves the size of values. Third-party data point (secondhand, Hacker News report of Microsoft's Office for Android tests):
  1.1 s vs 1.4 s time to interactive and 21.5 MB vs 30 MB against V8
  ([summary](https://engineering.fb.com/android/hermes/) for the design; the figures are not from a primary source: not verified).
- Against QuickJS, which is already a small interpreter, the gain on `hero` is likely small: the footprint there is Zinc's own raster and layout
  (9 MB empty program on QuickJS, 45-55 MB for hero). Where Hermes would pay is a large program with a big bytecode already compiled
  (no parse at start), which Zinc's own `.qbc` already does for QuickJS. I expect **no decisive advantage** over QuickJS on footprint; a clear
  one on start of big bundles only if `.hbc` is mmap'd. To be measured in the spike, not assumed.
- Speed: the interpreter is described by the project as comparable to QuickJS ("QuickJS is used as a performance reference",
  [blog 2025-07-15](https://github.com/facebook/hermes/blob/static_h/doc/blog/2025-07-15-static-h-performance-june-2025.md), results are images, so no numbers can be quoted).
  Expect parity with QuickJS, 2 to 8x slower than V8 on hot loops (V8's measured 1.9x faster than QuickJS on hero's CPU, 8-36x on
  three.js-style code per `quickjs-aot-jit-and-ffi.md`). That does not fit the owner's "fastest" goal for the desktop; it fits low-end phones and
  tablets without JIT.

### Bytecode precompilation at `zinc build`

`zinc bundle` (esbuild) already produces one script for V8 and JSC; for Hermes the bundle goes through `hermesc -emit-binary` into `.hbc`. The
version coupling (bytecode 99 ties the file to the VM) is handled like the engine pack's `zn_engine_abi`: the pack ships its own `hermesc`,
`zinc build` uses the one of the pack the app is pinned to, and the app records the pack version. The `code_cache` entry of `zn_engine` fits
(`NULL` today for JSC); `hermes_napi_compile.cpp` is the API for running bytecode.

### Debugger

Hermes has a CDP implementation (`API/hermes/cdp`, domains for Debugger, Runtime, Heap profiler; tools `hcdp`, `hdb`). It needs a transport
(React Native supplies one in Metro/inspector-proxy); in Zinc the `inspector(env, port)` slot of `zn_engine` would host a WebSocket (libuv and
llhttp are vendored) in front of it. Chrome DevTools then works as with V8. Medium effort, not first.

## 4. The compiler angle: could `shermes` replace or complement Zinc's AOT?

Zinc's AOT compiles a **strict typed subset of TypeScript** through a typed SSA IR to C++, linked with zrt, with Zinc's own plugin
registry and layout/raster runtime. Compare with Static Hermes:

| | Zinc AOT | `shermes -typed` |
|---|---|---|
| Source language | strict TypeScript subset, Zinc type checker, `zinc.d.ts` | Flow types (TS converted to Flow, partial), TS only through erasure |
| Object model | typed (records, arrays), no hidden JS object layer | exact objects, nominal classes, checked arrays; untyped values (`any`) fall back to Hermes values |
| Output | C++ with the toolchain Zinc pins (zig) | C or object file + the Hermes VM library |
| Runtime | zrt | Hermes VM (GC, object model, Promise polyfill) |
| FFI | plugins through `include/zn/native.h` | `$SHBuiltin.extern_c`, macOS-tested only |
| Status | the product | "in progress and considered unstable" |
| Published perf | zbench: AOT ties V8 on UI scenes | no typed-vs-V8 numbers found; only the 2024-2025 Octane ratios and images relative to QuickJS |

Findings:

1. **No overlap worth merging.** Zinc's type system, IR, the zbc interpreter, the three-engine diff (`tools/diff-matrix`), the plugin ABI and the
   renderer are Zinc's. `shermes` would need Zinc's TS converted to Flow-typed JS (or its JS output typed again), would lose Zinc's static
   guarantees at the boundary (every `any` is a checked cast), and would put Hermes's GC under a program that today has none of that.
   Replacing the AOT is a rewrite of the product with an unstable base: reject.
2. **As a complement for untyped JavaScript** (compile a JS app's bundle to native with `shermes -c`, link with a lean Hermes VM): plausible for iOS and
   consoles where no JIT is allowed and the JS path is otherwise a slow interpreter. Gain over `.hbc` is modest (1.1-1.7x interpreter from the project's
   own Octane table; larger only with type information). Cost: Zinc's `zinc build` gains a second toolchain path and a Hermes-only deployment.
   Defer: only worth it when a real iOS/console JS workload is too slow, which is outside the current Mac-first plan.
3. Risks: experimental typed mode; the project's own doc lists deviations (no Symbol.species, no local eval, async generators untested in
   production); Meta's roadmap is React Native's, not ours (the README says each release targets one RN version, version mismatch "can result in
   instant crash"): a pack must pin Hermes and its compiler together; ES modules absent; JIT arm64 only; Intl thin on desktop Linux/Windows.
4. What is genuinely reusable from Static Hermes: the idea of `$SHBuiltin.extern_c` (direct C call from typed code, no marshalling) is what Zinc's
   AOT already does through the plugin registry. Nothing to adopt.

## 5. Recommendation (scored as `RULES.md` §4)

Weights: fit x3, performance x3, size/footprint x2, maintainability x2, licence and supply risk x2, portability x1, effort x1 (maximum 70).

| Option | Fit | Perf | Size | Maint | Licence | Port | Effort | Total |
|---|---|---|---|---|---|---|---|---|
| A. Stay with QuickJS, JSC, V8 | 3 | 3 | 4 | 5 | 5 | 4 | 5 | **55** |
| B. Hermes V1 as `--engine hermes` pack (upstream Node-API) | 4 | 3 | 4 | 3 | 5 | 4 | 4 | **53** |
| C. `shermes` for untyped JS bundles, native on no-JIT targets | 3 | 4 | 3 | 2 | 5 | 3 | 2 | 46 |
| D. `shermes -typed` replacing or beside Zinc's AOT | 1 | 3 | 3 | 1 | 5 | 2 | 1 | 33 |

Reading: B is within noise of A (53 against 55): it wins on fit for modest and no-JIT hardware (RN-style apps, iOS, Android, the `rn-showcase` and
`rn-port` examples that target RN semantics), loses on maintenance (a fourth engine, a version-locked bytecode, a project steered by React Native).
Per §4 a tie goes to the choice with fewer moving parts, and a reversible choice is made at once: so **A stays the shipped state, B is a
time-boxed spike behind the engine interface**, and C and D are rejected for now.

### Phased plan

| Phase | Work | Reuses | Effort (estimate) |
|---|---|---|---|
| 0 (spike, half a day to one session) | build `hermesNapi` + `libhermes` on the Mac (`tools/build`-style ccache), `zn_engine_run` adapter modelled on `src/engine/v8.cpp`, run `examples/hero` and `tests/bench/napi/call.cc` | driver.cpp (Node-API only), napi trampoline table, `tests/bench/napi` | 4-8 h |
| 0 exit criteria | host call ns, hero first frame / footprint / CPU at 600 frames, a test262 sweep through `tools/test262` on `--engine hermes`, three.js load (`examples/js-three`) pass or fail, `Intl.Segmenter`/`Intl` use in the examples | the table of `zinc-next-perf.md` | included |
| 1 (only if phase 0 beats QuickJS on footprint or start, or helps a no-JIT target) | pack: `tools/engine-pack hermes`, `src/tc/engines.h` entry, licence files, `hermesc` shipped, `.hbc` in `zinc build --engine hermes`, `zinc compat --engines` entry | engine-pack, TUF index, `zinc engine install` | 2-3 sessions |
| 2 | microtask/rejection/interrupt/limits services; `inspector` through CDP; CI matrix macOS/Linux/Windows | `zn_engine` v2 slots | 2-3 sessions |
| 3 (not before an iOS/console JS need) | `shermes -c` of the bundle as an AOT option | AOT build path of `zinc build` | 3+ sessions, speculative |

Never: a typed Zinc path through `shermes`; a dependency on the `static_h` typed language.

### Open questions

1. Does the Hermes Node-API cover what `libzn_webgl` and `canvas2d` use at speed (`napi_define_class`, typed arrays in place,
   `napi_wrap` finalizers, `napi_adjust_external_memory` not driving the GC)? One afternoon of reading plus the spike.
2. Is a Hermes built for macOS x86_64 reasonable on the dev machine without JIT, and is the arm64 baseline JIT usable on a signed macOS app (no
   `allow-jit` need as it generates code into executable memory: it does need the same entitlement as JSC, to check)?
3. Do Zinc's JS libraries (gsap, three.js, `webenv`) run without local eval, `Symbol.species` and with `Function.prototype.toString` without
   source? (three.js uses none of them heavily; some libraries sniff `toString`.) Run `examples/js-*` in the spike.
4. WebAssembly: Zinc's wasm pack feeds QuickJS (`ee5db70c`). Could the same pack feed Hermes through Node-API `napi_*`, since Hermes has none?
5. Hermes's Intl on Linux/Windows needs ICU (`HERMES_ENABLE_INTL`); Zinc has `Intl.Segmenter` through libunibreak on QuickJS. How much of Intl
   the examples need on Hermes.
6. Release cadence and pinning: use the `260318099.0.x` stable branch (what RN 0.84 ships) rather than `static_h` head, and record it in the pack's
   `upstream` field.
7. Real numbers for libhermes size and RSS (this report estimates them) and typed-mode performance (none published).

## Sources

- Hermes repository, branch `static_h`: <https://github.com/facebook/hermes> ; docs `doc/Features.md`, `SpecIncompat.md`, `TypedLanguage.md`, `typescript-stripping.md`,
  `IntlAPIs.md`, `BuildingAndRunning.md`, `CrossCompilation.md`, `doc/blog/*` (2024-11-09, 2024-12-19, 2024-12-23, 2025-07-15, 2025-11-02, 2025-11-06, 2026-06-05)
  under <https://github.com/facebook/hermes/tree/static_h/doc>
- Hermes Node-API: <https://github.com/facebook/hermes/tree/static_h/API/napi> (README.md, COMPATIBILITY.md)
- shermes: <https://github.com/facebook/hermes/tree/static_h/tools/shermes>, FFI examples <https://github.com/facebook/hermes/tree/static_h/examples/ffi>
- React Native 0.84, Hermes V1 by default: <https://reactnative.dev/blog/2026/02/11/react-native-0.84>
- Callstack, Hermes V1 vs Static Hermes: <https://www.callstack.com/events/hermes-v1-what-it-is-what-it-isnt-and-whats-next> ;
  <https://www.callstack.com/events/react-native-0-84-and-other-news>
- Hermes original design (no JIT, mobile): <https://engineering.fb.com/android/hermes/>
- microsoft/hermes-windows: <https://github.com/microsoft/hermes-windows>
- Node-API call cost across engines: <https://github.com/NativeScript/runtimes/pull/75> (via `docs/reports/js-engines-jsc-v8.md`)
- Local: `docs/reports/js-engines-jsc-v8.md`, `docs/reports/zinc-next-perf.md` (host calls, hero, render suite), `RULES.md` §4, `src/engine/v8.cpp`, `docs/plugins.md` "Engine packs"
