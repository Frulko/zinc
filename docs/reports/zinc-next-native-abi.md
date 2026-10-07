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
