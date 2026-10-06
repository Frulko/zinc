# third_party

Vendored libraries. Each directory keeps the library's licence and the pinned version below; a dependency builds with clang
and `zig c++` and needs no install step (ARCHITECTURE.md, rules).

| Library | Version | Licence | Used for |
|---|---|---|---|
| mimalloc | v2.1.7 (`src/static.c` build, global `operator new/delete` and the object allocator of `src/rt`) | MIT | Fast malloc/free for the many small objects of the runtime (interpreter and AOT programs) |
| crypto-algorithms sha256 | commit cfbde48 (B-Con, 2015; `sha256.c`: 4cbc93d3…, `sha256.h`: a946e621…) | Public domain | SHA-256 of the toolchain downloads (src/tc) |
| stb_image | v2.30 (nothings/stb commit 2c980bb, `stb_image.h` sha256 594c2fe3…, PNG only) | MIT or public domain | PNG decoding of the assets (src/res) |
| QuickJS-ng | 0.17.0 (`quickjs-amalgam.c` sha256 7c853a67…, `quickjs.h` 747a7744…; the amalgamation of plugins/script/vendor/quickjs) | MIT | The second engine, `zinc run --engine quickjs` (src/qjs) |
| macos-shim | our own stand-in headers (CommonCrypto) | n/a | `zig cc` for macOS targets has no CommonCrypto; mimalloc includes it (src/tc cross builds) |
