# Native-module ABI (ZN-096)

`next/include/zn/native.h` is the whole contract between the engine and a native module (a plugin written in C, C++ or Rust). It is plain C99, also valid
C++20, and names no libuv, runtime or engine type, so a module needs nothing else to build. The registry is `next/src/rt/native.cpp` (`zn_native` library).
Design source: `docs/reports/parity/03-plugins-targets.md` §4. Test: `next/tests/native/` (a module in C99 + a driver), run by `next/tests/t0/native.sh`.

## Shape

- **Module**: `ZnModule{abi, size, name, exports, kinds, flags, init, poll, shutdown}`. `abi` must equal `ZN_ABI_VERSION` (1): a module built for another
  version is refused at registration, with both versions in the message. Names are unique; `init` may refuse loading.
- **Exports**: `ZnExport{name, sig, fn, flags}`. `sig` uses the runtime table letters (`s i u b d f h B I D`) as `params>result`; `>` alone is no parameter,
  `R<k>` a resource of kind k, `c(sig)` a callback, `P<t>` a promise of t, `n` no result. The signature the program expects is compared with the module's
  at call time (`-2`, both signatures in the message). `ZN_PURE_SCALAR` marks exports the AOT may call without a context.
- **Values**: `ZnVal` is 16 bytes (`i d s v h`). Strings are NUL-terminated and valid for the call; array results are filled in a buffer the engine owns
  (`ret_buf`) and copied out by the engine.
- **Status**: `ZN_OK`, `ZN_PENDING` (a promise was taken), `ZN_ERROR` or any other value is an error whose message was given to `set_error`.
- **Resources**: handles are `generation<<32 | slot+1`; a stale handle fails `res_get`. A kind's finalizer runs when the last reference goes, and at shutdown
  for leftovers (reverse order).
- **Callbacks**: `cb_retain/cb_release` count references; `cb_call` runs on the engine thread; `cb_post(cb, sig, args, n)` is thread-safe, copies strings and
  arrays, and the call happens when the loop drains the queue.
- **Promises**: `promise_take` during the call, then `promise_resolve(promise, type, value)` / `promise_reject` from any thread (`ZN_THREADS`).
  `loop_ref`/`loop_unref` keep the program alive while work is outstanding (`zn_native_pending`).

## Engine side

`zn_register_module`, `zn_native_find`, `zn_native_call`, `zn_native_set_sink` (resolve/reject/call/release into the interpreter), `zn_native_drain`
(called by the loop), `zn_native_poll`, `zn_native_shutdown`. Wiring the registry into the loader and the manifest's native key is the next task.

## Plugin native code (ZN-099, decision D3)

The plugins' `x.host.cpp` are built unchanged: `zinc native-gen` writes `zinc_native_x.h` (the abstract `NativeX` over zrt types), `zinc native-gen --thunk` writes
`zinc_native_x_thunk.cpp`, a `ZnModule` (`zn_module_X()`) whose exports convert `ZnVal` to `zrt::String`, `zrt::Array<T>` and `zrt::Fn` (a callback becomes a lambda
that queues the call with `cb_post`) and call the virtual method; `poll` runs the plugin's `zrt::Poller`s (`zrt::poll_pollers`, added to runtime/zrt.cpp).
The helpers are `src/native/zrt_compat.h`. One runtime owner: the host library links runtime/ already. CMake builds `zn_plugin_sqlite|process|socket`.
`tests/native/plugins_test.cpp` drives them (sqlite queries with text and blobs, a child process with its stdout and exit as callbacks, a loopback listener and client);
`tests/t1/native_plugins.sh` also runs `tests/conformance/sqlite.ts` linked with the sqlite plugin (`ZINC_NATIVE_LIBS=Sqlite=<lib>`, which the plugin loader of ZN-101 will replace).
Not covered yet: a Zinc closure passed to a native export and Promise results (ZN-167), so process and socket run from the driver, not from programs.

**Call overhead** (bench/native_call.ts, M-series macOS, `add(i32, i32)` of the C test module): 20 million calls take 1.21 s, 60 ns per call on the interpreter and
on the AOT build alike (budget 100 ns). A string argument and result (`greet`) costs about 0.15 us more (one copy in, one out).

## Building and loading plugin code (ZN-101, decisions D2 and D21)

`zinc plugin-build <plugin> [project]` (and the first use of a native module by a program) compiles the plugin's native sources into
`~/.zinc/cache/<target>/plugins/<name>-<hash>/`: its `x.host.cpp` (or `x.<target>.cpp`, or `native.impl` of the manifest), the thunk of `zinc native-gen --thunk`, the other C++
sources of the manifest, as `plugin.dylib|so` (for `dlopen`) and `plugin.a` (for AOT). The `.c` sources of the manifest (vendored libraries such as sqlite3.c) go into
`<name>-vendor-<hash>/vendor.a`, keyed by their content and the defines only, so an edit of the plugin does not rebuild them: sqlite's amalgamation takes 14 s once, an edit of
`sqlite.host.cpp` rebuilds in 0.3 s. The hash covers the sources, the generated header and thunk, the defines (`defines` of the target, `ZP_*` options), the flags, the compiler and the ABI headers.
System libraries come from `pkg-config` (`pkg`), `libs`, `frameworks` and `linkFlags`; a missing one stops the build with "needs the system library 'x': install the package <packages of the manifest>".
The compiler is `$CXX`/`c++`, else the pinned zig. `zinc` is linked with `-rdynamic`: a dlopened plugin finds zrt and the registry in it. The interpreter registers the module after `dlopen`;
`zinc build` links `plugin.a`, `vendor.a` and the libraries into the program, whose generated `main` registers `zn_module_<Name>` (no `dlopen`). `ZINC_NATIVE=real` prefers native code to a stand-in.
Cross targets (`zinc build --target`) do not build plugin code yet; the cache layout already keys by target.

## Callbacks and promises (ZN-167)

A Zinc closure passed to a native export becomes a callback handle (`ZnVal.h`, signature `c(<params>><result>)`: scalars, strings and arrays in, a scalar or string result). The engine keeps the closure
alive for the call and for as long as the module holds the handle (`cb_retain` / `cb_release`; the registry tells the engine with `ZnSink.hold` and `release`). The module runs it at once with
`cb_call` (a value comes back, on the engine's thread, during the export) or later from any thread with `cb_post` (the loop runs it: the prelude's `__runLoop` calls the new row `host.nativePoll`
every turn, which runs the modules' `poll`, the queued calls and the promise completions, and keeps the program alive while native work is pending). A callback runs in the frame above the
running call, so it can call natives itself.
A promise result `P<t>` is two more callbacks that the generated wrapper passes: `m(...): Promise<T>` becomes `new Promise<T>((res, rej) => __native_n(..., v => res(v), msg => rej(new Error(msg))))`; the
export returns `ZN_PENDING` after `promise_take`, and `promise_resolve` / `promise_reject` from any thread settle it on the loop. `zinc native-gen --thunk` writes `zrt::Fn` lambdas for callbacks (`cb_post`
for a void result, `cb_call` otherwise) and keeps the loop alive while a plugin `Poller` is active. Not covered: `zrt::Promise<T>` members in thunks (gphoto2) and string results of callbacks beyond
the call. An error raised inside a callback ends the program like any runtime error.
Verified on the native plugins: `wasm.ts` and `socket.ts` conformance programs and a `zinc:process` spawn print their frozen output; `tests/golden/run/native_callbacks.ts` covers the C test module in the interpreter and AOT.

## zinc:script (ZN-103)

`src/qjs/script_native.cpp` is a Tier-B module (C ABI, no zrt) that `zinc` registers at start; plugins/script/index.ts is unchanged. The spec's `unknown` values travel as JSON: the generated wrapper of
`requireNative` converts with `__nativeJson` (undefined is the empty text), `__nativeValue` and `__nativeArgs`, a `DynFunction` becomes `c(s>s)` (JSON array in, JSON out, a Zinc `throw` becomes an
`Error` in the script through `cb_error`) and a callback type that mentions `unknown` gets an adapter. Functions of the script cross as `{"__zn_fn": n}`. Entries arm the time limit and pump the promise jobs;
memory and stack limits are QuickJS's own; `interrupt` stops a running script. The plugin is `deterministic` (wall-clock limits only). `tests/t1/script.sh` runs script_basic.ts and script_async.ts interpreted and compiled.
An AOT function that only calls natives is not a leaf: its registers cannot be C++ locals (the callbacks run in the frame above them).

## Display drivers (ZN-104)

`zinc.json` `display` (a name or `{ driver, ...options }`, per target), the board file's (`boards/<id>.json`, `all` / `targets.<t>`: also the surface `width` and `height`) and `ZINC_DISPLAY` pick a display
plugin (`kind: "display"`); `zinc run` and `zinc build` build its sources (`targets.<t>.sources`, the options as `ZP_DISPLAY_<X>_*` defines) into the plugin cache and load it: the shared library's
static constructor registers its `HalDisplay` with the runtime (`runtime/include/hal.h`), `zinc build` links the archive whole (`-force_load` / `--whole-archive`) and bakes the board's `ZINC_SIZE` into the
program's `main`. A headless or deterministic run (ZINC_HEADLESS, ZINC_DETERMINISTIC) keeps the host window unless `ZINC_DISPLAY` is set. The macOS emulator windows use the host's SDL3 (include directory
from the CMake build); `zinc:gfx`'s finish now calls the driver's `shutdown` (it writes `ZINC_SHOT` and closes the window or the device). `tests/t1/display_drivers.sh` runs ws2812, ssd1306 and scrollphat on
the board and LED examples under SDL's dummy video driver, and the remote display against a `zinc:remote` viewer on loopback: the viewer's frame equals the server's own render pixel for pixel.
`zinc native-gen --thunk` now carries `Promise<T>` members of zrt specs (the zrt promise settles into `promise_resolve` / `promise_reject`; the poll turn drains zrt's microtasks), which `remote-view` and `gphoto2` need.
