# ffi (`zinc:ffi`)

## What it is
Call C functions from shared libraries (`dlopen`, `dlsym`) with number and string signatures, plus C memory helpers. For makers who need a system library (zlib, libc, a vendor SDK) without writing a plugin.

## Targets and status
- plugin.json: macos (`libs: ffi`), linux (`libffi-dev`). `requires: dynlib, process`. Windows is not in the manifest, yet `suffix` returns `dll` for windows.
- Doc: macos/linux x86-64 and arm64; refused on ESP32, PS1, PS2, wasm, rpi1, rmpp. A sim stand-in (`native/ffi.sim.ts`) knows ~20 libc/libm functions.
- Test: `tests/conformance/ffi.ts` + `.out` (frozen corpus), `requires` tests. No `tests/t0|t1/ffi*` and no `plugins/ffi/` entry in tests/affected.json.
- backlog/later.md: ZN-102 "sqlite, wasm, process and ffi conformance in the Linux container" (cross-platform pass).

## What the docs have
- [x] Overview (one line)
- [~] Requirements: targets listed, but no "install libffi" line for Linux (`apt install libffi-dev` is only in plugin.json)
- [x] Quick start (strlen, crc32 on libz)
- [~] API reference: dlopen, fn, call, alloc/free/read/write/readCString, suffix. Missing `Library.symbol`, `Library.close`, `Library.path`, `ForeignFunction.name`
- [x] Example code
- [ ] Runnable example in examples/ (none imports zinc:ffi)
- [ ] Screenshot/GIF (not meaningful; a terminal capture of the quick start would do)
- [ ] Tutorial
- [ ] Commands a user types
- [~] Notes: limits and unsafety are good; no macOS/Linux library search path tips, no Windows
- [~] Test named, but it is a frozen conformance file, not a tier test

## What is missing
1. Rewrite "How it calls without libffi": the code uses libffi (`ffi.host.cpp` includes `ffi.h`), see Wrong or stale.
2. Document `Library.symbol(name)`, `close()`, `path`, `ForeignFunction.name`, and the closed-library error.
3. Runnable example `examples/ffi-zlib` (or a snippet in docs): crc32/compress with libz, printing results; with `zinc run`.
4. 4-step tutorial: "Call libm", "Pass a string", "Get a string back", "Out-parameters with alloc/read" (a full `write` example; the quick start has it commented out).
5. Table of type mapping: Zinc type, C type, accepted values (bool, null), return forms.
6. Troubleshooting: `symbol not found`, `dlopen` path on macOS (SIP, `/usr/lib`), Linux sonames (`libz.so.1`), crash on wrong signature.
7. Security note box and the `zinc trust` link (what a plugin that needs dynlib implies).
8. A tier test (`tests/t0/ffi.sh`) and an affected.json mapping for `plugins/ffi/`.
9. Windows decision (LoadLibrary) in the table: supported/refused. (owner)
10. Say which libs exist by default on a stock Linux for the examples (libz may be absent).

## Wrong or stale
- Doc "How it calls without libffi" and "libffi would lift these limits" contradict plugin.json ("through libffi", libffi-dev, `libs: ffi`) and `ffi.host.cpp` (calls via `ffi_call`, prototype fixed to `R f(int64 x n, double x m)`). Either the section describes the register convention that libffi is fed, or it is outdated.
- `suffix` doc says "`dylib` or `so`"; code also returns `dll` on windows.
- Doc compares to txiki `tjs:ffi`; the module says "type 'f32' (return only)" and `retCode` treats it; fine.
- Quick start has `/* write(buf, [1, 2, 3]) */` commented: the example does not exercise `write`, and `write` is not imported.

## Suggested pages
- API: ffi (generated)
- Guide: Calling C from Zinc (types, strings, memory)
- Steps: Call libm and libz
- Steps: Out-parameters and buffers
- Examples: ffi-zlib
- Notes: Limits (variadics, structs, callbacks) and safety
- Notes: Library search paths per OS; the sim stand-in
