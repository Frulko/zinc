# third_party

Vendored libraries. Each directory keeps the library's licence and the pinned version below; a dependency builds with clang
and `zig c++` and needs no install step (ARCHITECTURE.md, rules).

| Library | Version | Licence | Used for |
|---|---|---|---|
| mimalloc | v2.1.7 (`src/static.c` build, global `operator new/delete` and the object allocator of `src/rt`) | MIT | Fast malloc/free for the many small objects of the runtime (interpreter and AOT programs) |
| crypto-algorithms sha256 | commit cfbde48 (B-Con, 2015; `sha256.c`: 4cbc93d3…, `sha256.h`: a946e621…) | Public domain | SHA-256 of the toolchain downloads (src/tc) |
| stb_image | v2.30 (nothings/stb commit 2c980bb, `stb_image.h` sha256 594c2fe3…, PNG only) | MIT or public domain | PNG decoding of the assets (src/res) |
| QuickJS-ng | 0.17.0 (release v0.17.0 archive sha256 559bc4c420475e55c7ab4510adbc562f55d7524d75e8e89d79ce4bb02f5687d9; the split sources `quickjs.c`, `dtoa.c`, `libregexp.c`, `libunicode.c` and their headers, one copy: no amalgam; `libregexp` and `libunicode` are the library `zn_regexp`, plus `src/host/lre_host.c` for what libregexp asks of the embedder) | MIT | The second engine, `zinc run --engine quickjs` (src/qjs), and the regular expressions of the typed engine (src/host/regexp.cpp, ZN-090) |
| macos-shim | our own stand-in headers (CommonCrypto) | n/a | `zig cc` for macOS targets has no CommonCrypto; mimalloc includes it (src/tc cross builds) |
| yyjson | 0.13.0 (`yyjson.c`, `yyjson.h` from the release archive, archive sha256 34e0f62a…) | MIT | JSON reading: plugin.json (src/frontend/plugin_manifest.cpp); later zinc.json, tsconfig paths, JSON.parse (ZN-L-json-numbers) |
| libuv | 1.53.0 (release archive sha256 279f3f67a24bb9921fe999ca6cd5e332fade8d515873ef9ba054b70e70a31d9e; `include/`, `src/` and the macOS and Linux sources listed in `libuv/zn-sources.txt`, not the build system) | MIT (and the licences of `LICENSE-extra`) | The event loop of the host: child processes (`uv_spawn`) and real waits (src/host/loop.cpp, include/zn/loop.h); later sockets, timers and file I/O |
| llhttp | 9.3.0 (release archive `llhttp-release-v9.3.0.tar.gz` sha256 1a2b45cb8dda7082b307d336607023aa65549d6f060da1d246b1313da22b685a; `include/llhttp.h`, `src/{api,http,llhttp}.c`, the generated release sources) | MIT | The HTTP/1.1 parser of zinc:net, client and server (src/host/http.cpp) |
| mbedTLS | 4.0.0 (release archive `mbedtls-4.0.0.tar.bz2` sha256 2f3a47f7b3a541ddef450e4867eeecb7ce2ef7776093f3a11d6d43ead6bf2827; `include/`, `library/`, `tf-psa-crypto/{include,core,drivers/builtin}`; tests, programs, docs, scripts and the other drivers not vendored; our own CMake target `zn_mbedtls`, default configuration) | Apache-2.0 OR GPL-2.0-or-later (used under Apache-2.0) | TLS 1.2/1.3 and the PSA crypto API: https in zinc:net, TLS for zinc:mqtt, crypto.subtle (src/host/{tls,crypto}.cpp); `-DZN_TLS=OFF` leaves it out |
| HarfBuzz | 14.6.0 (release archive `harfbuzz-14.6.0.tar.xz` sha256 d07a007327277708a2a73ae437887cdbaf282937f6d03ca5467723e9099af586; `src/` without tests, scripts and the CoreText, DirectWrite, FreeType, GDI, GLib, Graphite2, ICU, Uniscribe, WASM and Cairo backends; our amalgamation `zn-harfbuzz.cc`) | "Old MIT" | Text shaping: kerning, ligatures, complex scripts (src/text, ZN-114) |
| SheenBidi | 3.0.0 (tag v3.0.0 archive sha256 86c56014034739ba39a24c23eb00323b0bf6f737354f665786015fca842af786; `Headers/`, `Source/`, built as the unity file `SheenBidi.c`) | Apache-2.0 | Unicode bidirectional algorithm, UAX #9 (src/text) |
| libunibreak | 8.0 (release archive sha256 9c4fad6e517338a098373acc9f35579ae2c325e6446666fb9ac2666ba15ceba4; the line-break sources of `src/`, no tests) | zlib | Line break opportunities, UAX #14 (src/text) |
| stb_truetype | v1.26 (nothings/stb, `stb_truetype.h` public domain) | MIT or public domain | Rasterising glyph ids of the shaping tier (src/text) |
