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
