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
| yyjson | 0.13.0 (`yyjson.c`, `yyjson.h` from the release archive, archive sha256 34e0f62a…) | MIT | JSON reading: plugin.json (src/frontend/plugin_manifest.cpp); later zinc.json, tsconfig paths, JSON.parse (ZN-L-json-numbers) |
| libuv | 1.53.0 (release archive sha256 279f3f67a24bb9921fe999ca6cd5e332fade8d515873ef9ba054b70e70a31d9e; `include/`, `src/` and the macOS and Linux sources listed in `libuv/zn-sources.txt`, not the build system) | MIT (and the licences of `LICENSE-extra`) | The event loop of the host: child processes (`uv_spawn`) and real waits (src/host/loop.cpp, include/zn/loop.h); later sockets, timers and file I/O |
| llhttp | 9.3.0 (release archive `llhttp-release-v9.3.0.tar.gz` sha256 1a2b45cb8dda7082b307d336607023aa65549d6f060da1d246b1313da22b685a; `include/llhttp.h`, `src/{api,http,llhttp}.c`, the generated release sources) | MIT | The HTTP/1.1 parser of zinc:net, client and server (src/host/http.cpp) |
