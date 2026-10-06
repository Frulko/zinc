# Zinc Next: library choices (parity study 04)

Date: 2026-10-07. Scope: 22 needs, Windows out of scope (need 21).

**Evidence tags.** `[V]` = queried on 2026-10-07 through the GitHub API or the upstream site (release tag, date, stars, SPDX licence, file
sizes). `[bg]` = background knowledge, not re-checked online today (performance claims, code-size estimates, feature lists). Sizes are
source KB unless "code" is written. Nothing below was benchmarked by this study: perf claims are the upstream's own, so every "pick" that
depends on speed carries a measuring task (see the end).

**Rules applied** (`next/ARCHITECTURE.md`, `next/third_party/README.md`, owner memory): mature library over our own code; permissive licence
(MIT/BSD/Apache/zlib/ISC/PD; GPL/LGPL only as a separately loaded plugin); vendored under `next/third_party/<name>/` with licence, pinned
tag and per-file sha256 in `third_party/README.md` (the format already used for QuickJS-ng and stb); builds with clang and `zig c++`;
no install step; desktop first, small targets (ESP32 ~300 KB RAM, Pi 1 armv6, PS1/PS2) when possible; the engine stays pluggable: every
heavy library sits behind `include/zn/host.h` or a `zinc:` plugin, never in `src/rt`.

**Checksum approach, everywhere.** (1) Pin the upstream release tag AND the commit sha (`git ls-remote <url> refs/tags/<tag>^{}`).
(2) Vendor only the files the build needs, unmodified, plus the LICENSE. (3) Record `sha256` of each vendored file in `third_party/README.md`
(`shasum -a 256`), as done for `sha256.c` and `quickjs-amalgam.c`. (4) Where upstream publishes a release archive hash (SQLite SHA3-256,
libffi tarball sha256, mbedTLS `.tar.bz2` + `.asc`), check it before copying and note it. (5) A `tools/vendor-check` script (proposed, ZN-058)
re-hashes the tree in T0 so a silent edit fails CI.

**Existing state that decisions must respect.** `plugins/` already carries own or vendored code for sqlite (SQLite 3.53.4 amalgamation [V]),
wasm (wasm3), ffi (own dlopen, "no libffi"), lottie, svg, map, three, video, socket (all own code). `src/res` and `runtime/ttf.cpp` are
own TrueType and SVG rasterizers whose pixels are frozen in goldens (ZN-044/045/048). Changing a rasterizer means re-baselining goldens:
flagged as a risk wherever it applies.

---

## 1. Regular expressions (JS semantics, Unicode)

| Candidate | Licence | Size | Release / adoption | JS semantics | Embedded fit | Notes |
|---|---|---|---|---|---|---|
| **QuickJS-ng `libregexp` + `libunicode` + `cutils`** | MIT | libregexp.c ~116 KB, libunicode.c ~62 KB, tables ~250 KB source (the table file is `libunicode-table.h`); about 60-80 KB of code with tables [V sizes at v0.17.0] | v0.17.0, 2026-09-18, 3.9k stars [V]; already vendored (amalgam exports `lre_compile`/`lre_exec`, `lre_case_conv`, `unicode_normalize`, `unicode_script` [V]) | Full ES2024: named groups, lookbehind, `u`/`v`/`s`/`y`/`d` flags, `\p{...}`, case folding, passes test262 RegExp suites [bg] | Yes (QuickJS runs on ESP32 class; mquickjs shares the same regex engine) | Backtracking: ReDoS possible; needs a step or time budget (quickjs-ng has a timeout hook in `lre_exec`) |
| PCRE2 | BSD-3 | ~700 KB source, ~300 KB code [bg] | 10.4x, very mature | Perl semantics, not JS (lookbehind rules, `\d`, case folding, named-group syntax and `lastIndex` differ) | Heavy | Would need a translation layer and still differ on corner cases |
| RE2 / Abseil | BSD-3 | multi-MB, pulls Abseil | mature | No backreferences, no lookaround: not JS | No | Linear time, but not the language |
| Oniguruma | BSD-2 | ~500 KB | mature (Ruby, PHP mbstring) | Ruby syntax, has an ONIG_SYNTAX_JAVASCRIPT [bg] with gaps | Medium | Not tested against test262 |
| `std::regex` | libstdc++/libc++ | 0 | n/a | ECMAScript grammar but no lookbehind, no named groups, no `\p`, no `u`/`s` flags; 10-100x slower, stack overflow on long input [bg] | Bad | Reject |

**Decision: QuickJS-ng libregexp (+ libunicode, cutils), same tag as the engine (0.17.0).** It is the only candidate that is JS by construction and it is
the exact code `--engine quickjs` runs, so the typed engine and the second engine cannot disagree on a match (single-source rule, like `zn::ops`).

**Risks.** (a) The amalgam already defines the `lre_*` symbols: linking a second copy collides. Fix: vendor the *split* files
(`libregexp.c`, `libunicode.c`, `cutils.c`, `quickjs.c`) at the same tag instead of the amalgam, and build `zn_lre` as its own static target
that `src/rt` and `src/qjs` both link. (b) Catastrophic backtracking: wrap `lre_exec` with the interrupt/timeout opaque and a default budget (for example
10 M steps), throw `RangeError`. (c) Bytecode of a compiled regex is internal; cache by (source, flags) in `src/rt`, not on disk.
(d) Unicode data version trails Unicode releases; QuickJS regenerates tables with `unicode_gen` (UCD 17 in 0.17 [bg]): acceptable.

**Integration.** `src/rt/regexp.cpp` (new, behind `include/zn/ops.h` entries `regexp_compile/exec/replace/split`); `third_party/quickjs-ng/` converts from
amalgam to split files; `src/qjs` keeps using it. Task: new **ZN-058 "RegExp, String Unicode ops on libregexp/libunicode"**, prerequisite of
the web-API parity work (ZN-049 host modules). Checksum: tag `v0.17.0`, sha256 of the four files in README.

---

## 2. Unicode normalization, case, segmentation

| Candidate | Licence | Size | Release | Covers | Embedded |
|---|---|---|---|---|---|
| **libunicode (QuickJS-ng)** | MIT | in the 62 KB + tables above | v0.17.0 [V] | NFC/NFD/NFKC/NFKD, full case conversion and folding, `\p` general category + script + binary properties, ID_Start/ID_Continue | Yes |
| utf8proc | MIT (+ Unicode data licence) | `utf8proc_data.c` ~250 KB source, ~300 KB code [V size] | v2.12.0, 2026-09-25, 1.3k stars [V] | Normalization, case map, **grapheme clusters (UAX29)**, char width, categories | Desktop/Pi; too big for ESP32 |
| libunibreak | zlib | small (~100 KB code) | libunibreak_8_0, 2026-09-15 [V], 218 stars | UAX14 line breaking, UAX29 word/grapheme/sentence | Yes |
| libgrapheme (suckless) | ISC | ~70 KB | 2.x [bg] | grapheme, word, sentence, line, case | Yes, hosted on git.suckless.org (no GitHub release to verify) |
| ICU (subset) | Unicode-3.0 | full ~30 MB data; filtered subset 1-3 MB code+data [bg] | release-78.3, 2026-03-17 [V] | Everything incl. collation, Intl, bidi | No; build system heavy (autotools + data filter JSON) |

**Decision: libunicode for everything JS needs** (normalize, case, `\p`, identifier tests; zero new dependency), **libunibreak (8.0, zlib) for
text-layout segmentation** (UAX14 line break, UAX29 grapheme/word) in a `text` plugin. utf8proc not adopted: it duplicates the normalization/case tables
we already carry; adopt it only if we find libunicode's grapheme gap blocking. ICU rejected (size, build); `Intl.*` is out of the first parity cut (revisit
with ICU4X, Unicode-3.0, if the Rust toolchain ever becomes acceptable: no).

**Risks.** Two Unicode data versions (libunicode vs libunibreak) can disagree on a new character: pin both and list the Unicode version in README.
`Intl.Segmenter` and `localeCompare` collation are not covered: document as gaps.

**Integration.** `src/rt/unicode.cpp` wraps libunicode (task ZN-058); `plugins/text` (new) or `src/res` layout uses libunibreak
(task **ZN-060 text shaping and layout**, see 10).

---

## 3. JSON speed; number to string and string to number

### 3a. JSON

| Candidate | Licence | Size | Release / adoption | Speed evidence | Embedded fit | API fit |
|---|---|---|---|---|---|---|
| **yyjson** | MIT | 2 files, `yyjson.c` ~420 KB source, ~100-150 KB code [V size 0.13.0] | 0.13.0, 2026-09-08, 3.9k stars [V] | Upstream benchmarks: parse ~1.8 GB/s (twitter/canada) on M1 class, writes faster than rapidjson, 2-3x rapidjson [bg, upstream README] | Works on ARM32; works on ESP32 with allocator hook [bg]; no SIMD needed | Immutable doc + mutable doc, custom allocator, JSON5-ish flags, big-number raw mode, C99 |
| simdjson | Apache-2.0 | amalgamated `simdjson.cpp`+`.h` ~1.1 MB source, 300+ KB code [bg] | v5.0.2, 2026-10-04, 24k stars [V] | Fastest on x86/NEON (3+ GB/s) [bg]; needs padded input and SIMD dispatch | No SIMD on armv6/ESP32 (fallback is slower and bigger) | Read-only on-demand API; no writer; awkward to build a Zinc object graph |
| RapidJSON | MIT (+ BSD parts) | ~800 KB headers | v1.1.0, 2016-08-25, 15k stars; last push 2025-02 [V] | Was the reference ~2015 | Heavy template code | Stale: no release in 10 years |
| nlohmann/json | MIT | 900 KB header | v3.12.0, 50k stars [V] | 5-10x slower than yyjson [bg] | No | Convenience API only |

**Decision: yyjson 0.13.0 for `JSON.parse` and the serializer-to-string core.** Smallest, fastest portable one; one C file; MIT; its reader builds
the DOM that we then convert to Zinc values in one pass (or walks with the iterator API into a `Dyn`). `JSON.stringify` with replacer/indent/toJSON stays
our walker in `src/rt` (semantics of the language, not of JSON) and calls yyjson only for string escaping and number printing helpers it already exposes;
if profiling shows our walker is the slowest part, switch to `yyjson_mut` documents.

**Risks.** Parse errors need the JS messages (`Unexpected token ... at position`): map `yyjson_read_err` code+pos. Duplicate keys: JS keeps the last: yyjson keeps both,
resolve in the converter. Numbers beyond 2^53 are fine (`YYJSON_READ_NUMBER_AS_RAW` available). simdjson stays a possible desktop-only plugin for >100 MB inputs; not needed now.

### 3b. double to string and string to double

| Candidate | Licence | Size | Release | Notes |
|---|---|---|---|---|
| **fast_float** (parse) | Apache-2.0 / MIT / BSL-1.0 | header-only ~61 KB [V] | v8.3.1, 2026-10-04, 2.1k stars [V] | Correctly rounded; 4-10x faster than `strtod`; the implementation inside libstdc++ `from_chars`, MSVC, Chrome/WebKit/Node (via ada-url) [bg]; locale independent; C++11 |
| **dragonbox** (print) | Apache-2.0 / Boost dual | header-only ~ 100 KB incl. compact cache option | 1.1.3, 2022-06-18; commits to 2025-10; 821 stars [V] | Shortest round-trip digits, faster than Ryu and Grisu on benchmark (author's graphs [bg]); `compact` cache variant trades ~20% speed for a ~10 KB table (good for ESP32) |
| Ryu | Apache-2.0 / Boost | `d2s.c` + 10 KB-20 KB tables (`d2s_small_table.h` has the small version) | v2.0 tag, last commit 2026-02, 1.4k stars [V] | Good and mature; one step slower than Dragonbox; C |
| double-conversion (Grisu3 + bignum fallback) | BSD-3 | ~250 KB | stable; used by V8 historically [bg] | Has ToShortest/ToPrecision/ToExponential: the JS `Number#toString` family, but big and slower |
| `std::to_chars`/`from_chars` | stdlib | 0 | libc++ has shortest `to_chars` since LLVM 14, `from_chars(double)` only since LLVM 20; Apple clang lacks it [bg] | Not available or not the same on every toolchain; output digits could differ only across libs without correct shortest, but availability alone kills it |

**Decision: fast_float v8.3.1 for string-to-double, dragonbox 1.1.3 for double-to-string.** Dragonbox gives the shortest digits and our own 30-line JS
`Number::toString` formatter (exponent thresholds 1e21, 1e-7, radix) sits on top; the output is bit-identical on every target libc, which is what the goldens need.
Do not use `std::to_chars`: it is missing on Apple clang for parse and its availability varies by libc++ version.

**Risks.** Dragonbox has not tagged a release since 2022 (code is stable, the repo is maintained); pin the commit sha as well as tag 1.1.3. `toFixed/toPrecision`
need exact big arithmetic: keep the current exact implementation in `include/zn/ops.h` (decimal expansion from dragonbox digits is not enough); test against test262 `Number.prototype.to*`.

**Integration.** `third_party/yyjson/`, `third_party/fast_float/`, `third_party/dragonbox/`; wrappers in `src/rt/json.cpp` and `include/zn/ops.h`
(`ops::num_to_str`, `ops::str_to_num`). Task **ZN-059 "JSON and number formatting on yyjson, fast_float, dragonbox"** (the architecture file already names "JSON,
number formatting" as library-first).

---

## 4. Sockets, event loop, HTTP/TLS client and server, WebSocket

| Candidate | Licence | Size | Release / adoption | Fit |
|---|---|---|---|---|
| **libuv** | MIT | ~1.4 MB source, ~250-400 KB code | v1.53.0, 2026-09-24, 27k stars [V]; Node, Julia, Neovim | Loop + timers + TCP/UDP + DNS + fs + threadpool + process spawn + tty + fs events on macOS/Linux; no ESP32 (use lwIP select loop behind the same interface); build is CMake/Makefile: vendor the `src/unix` + `src/*.c` list and write our own compile list |
| own loop (kqueue + epoll + poll) | ours | ~600 lines | n/a | Reinvents the wheel, but small; only for devices |
| uSockets + uWebSockets | Apache-2.0 | ~100 KB | uSockets v0.8.8 2024-02, pushed 2026-09 [V] | Very fast server/WebSocket (permessage-deflate); client is weaker; C++20; TLS through OpenSSL/wolfSSL/BoringSSL, not mbedTLS |
| mongoose (Cesanta) | **GPL-2.0 or commercial** [V: "Other"] | 1 file | 7.23, 2026-08-12, 13k stars | Reject: licence |
| civetweb | MIT | ~300 KB | v1.16, 2023-04-10; pushed 2026-08 [V]; 3.5k stars | Thread-per-connection server, small; stale releases; client basic |
| libcurl | curl (MIT-like) | ~600 KB-1 MB with TLS | curl-8_22_0, 2026-09-02, 43k stars [V] | Best HTTP client (H1/H2/H3, proxies, redirects, cookies); build heavy (cmake/autoconf, 100s of options), big for Pi 1; no server |
| llhttp | MIT | ~100 KB generated C | v9.4.3, 2026-07-30, 1.9k stars [V]; Node's parser | HTTP/1.1 parser only; need glue; zero allocation; the fastest |
| nghttp2 | MIT | ~250 KB | v1.70.0, 2026-07-29 [V] | HTTP/2 later |
| wslay | MIT | ~60 KB | release-1.1.1, 2022-08 [V]; 675 stars | WebSocket framing state machine, no I/O; stale but small and stable (RFC 6455 is frozen) |
| TLS: **mbedTLS 4.2.0** | Apache-2.0 OR GPL-2.0+ (dual, take Apache) [V from README] | ~400 KB code (configurable to ~100 KB) | mbedtls-4.2.0, 2026-07-07, 7k stars [V]; TF-PSA-Crypto v1.2.0 split | TLS 1.2 + 1.3, X.509, ESP-IDF's own TLS stack (hardware AES/SHA on ESP32) [bg], builds as plain C |
| TLS: BearSSL | MIT | ~60-100 KB code | last release 0.6 (2018) [bg], no GitHub release data | TLS 1.2 only, no 1.3; unmaintained; excellent footprint |
| TLS: wolfSSL | **GPL-3.0 or commercial** [V] | | v5.9.4 | Reject: licence |
| TLS: OpenSSL 4.0.3 | Apache-2.0 | ~3 MB, perl Configure | 2026-09-29 [V] | Reject: size, build |

**Decision.**
- **Event loop:** `zn::host::Loop` interface (timers, fd readiness, post-from-thread). Desktop/Pi/rMPP implement it with **libuv 1.53.0**; ESP32 and bare-metal
  use a ~150-line poll/lwIP loop. The engine never includes libuv headers: only `plugins/net` and `src/host` do. libuv's threadpool also carries `fs`, `process`, DNS.
- **HTTP client and server:** **llhttp 9.4.3 + our thin HTTP/1.1 glue (about 600 lines: request building, chunked, redirects, keep-alive) on libuv sockets.** Not libcurl: it is
  the better client but costs 2 to 4x the footprint, and has a configure matrix that fights "no install, clang + zig c++". Optional later: libcurl as a plugin when HTTP/2/3 and proxy
  auto-config are demanded (`zinc:net` stays the same interface).
- **WebSocket:** **wslay 1.1.1** for framing (+ SHA-1 handshake from mbedTLS), `zinc:net` WebSocket on top.
- **TLS:** **mbedTLS 4.2.0** (client and server), with a pinned Mozilla CA bundle (`cacert.pem` of curl.se, ~220 KB, dated in README) and an option to use the OS store on macOS later.
- **Server:** same llhttp glue; static files and routing are our code. If a production-grade server is needed later, uWebSockets is the upgrade path (Apache-2.0).
- **Sockets:** BSD sockets; ESP32 uses lwIP BSD API. Windows out of scope.

**Risks.** libuv vendored without its build system: keep the per-OS source list in `third_party/libuv/zn-sources.txt` and test on macOS, Linux x86_64/aarch64/armhf with `zig c++`.
mbedTLS 4 is a new major (4.0 removed many legacy APIs, uses PSA only): do not copy 3.x snippets; pin 4.2.0 and test the TLS 1.3 handshake against 3 public hosts in a T2 test.
Our HTTP glue is code we own: keep it to HTTP/1.1, no H2; fuzz it (section 19). A one-file client for the ESP32 can use ESP-IDF `esp_http_client` behind the same interface.

**Integration.** `plugins/net` (replaces `plugins/socket` internals), `src/host/loop_libuv.cpp`; tasks ZN-049 (host modules, partly done: fs, net, os, timers) plus new **ZN-061 "zinc:net on libuv, llhttp, mbedTLS, wslay"**.

---

## 5. Crypto (WebCrypto subset)

| Candidate | Licence | Size | Release | Coverage |
|---|---|---|---|---|
| **mbedTLS 4.2 / TF-PSA-Crypto 1.2.0** | Apache-2.0 OR GPL-2.0+ | crypto-only ~150-250 KB code, modular | v1.2.0 (TF-PSA-Crypto), 2026-09 [V] | SHA-1/2/3, HMAC, HKDF, PBKDF2, AES-CBC/CTR/GCM, ChaCha20-Poly1305, ECDSA/ECDH P-256/384/521, Ed25519 (4.x), X25519, RSA PKCS1/PSS/OAEP, CTR_DRBG; PSA API |
| libsodium | ISC | ~400 KB | 1.0.22, 2026-04-09, 14k stars [V] | Great for X25519/Ed25519/ChaCha/Argon2; **no ECDSA P-256, no RSA, no AES-GCM without CPU AES** => cannot cover WebCrypto |
| BearSSL | MIT | ~50 KB | 0.6 (2018) | AES (constant time), SHA, HMAC, ECDSA, RSA; no maintenance, no 4.x style API |
| libtomcrypt | Unlicense/WTFPL | ~400 KB | v1.18.2 2018-07-02 tag; commits to 2026-09 [V] | Everything; stale releases, no hardware accel, no constant-time guarantees on all paths |
| OpenSSL | Apache-2.0 | 3 MB+ | 4.0.3 | Full; reject for build/size |

**Decision: mbedTLS (TF-PSA-Crypto) 4.2.0**, same dependency as TLS, so one crypto library for `crypto.subtle` and the network. Random: `crypto.getRandomValues` and `crypto.randomUUID`
use the OS (`getentropy`/`arc4random_buf`/`getrandom`/ESP32 `esp_fill_random`) to seed; do not rely on mbedTLS entropy callbacks in the portable layer. Keep `sha256.c` (B-Con) only for `src/tc`
to avoid the toolchain depending on a TLS build.
**Risks.** WebCrypto surface is wide: first cut SHA-1/256/384/512, HMAC, PBKDF2, HKDF, AES-GCM/CBC/CTR, ECDSA/ECDH P-256/P-384, Ed25519, RSA-PSS/OAEP, `getRandomValues`, `randomUUID`; JWK/SPKI/PKCS8 import-export is our parsing code (mbedTLS gives ASN.1). Side channels: use only PSA calls, not raw bignum.
**Integration.** `plugins/crypto` (new) over `third_party/mbedtls/`; task **ZN-062 "WebCrypto subset on mbedTLS"**.

---

## 6. SQLite and alternatives

| Candidate | Licence | Size | Release | Fit |
|---|---|---|---|---|
| **SQLite amalgamation** | Public domain | `sqlite3.c` ~9 MB source; ~700 KB-1 MB code, ~400-500 KB with `SQLITE_OMIT_*` and no FTS/RTREE/JSON1 [bg] | 3.53.4, `sqlite-amalgamation-3530400.zip` on sqlite.org [V]; 10.6k stars mirror | Already in `plugins/sqlite/vendor` at 3.53.4 [V]; the standard; sha3-256 published on `sqlite.org/download.html` |
| libSQL | MIT | bigger | fork | Server features we do not need |
| LMDB | OpenLDAP | ~100 KB | 0.9.x | Key-value only; memory-mapped; fine for storage, not SQL |
| DuckDB | MIT | 30+ MB | | Analytical, huge |
| UnQLite / litedb | BSD / | small | stale | Not SQL |

**Decision: SQLite 3.53.4 amalgamation (already vendored), moved from `plugins/sqlite/vendor` to `next/third_party/sqlite/` with the zip sha3-256.** Compile with
`-DSQLITE_THREADSAFE=0 -DSQLITE_OMIT_LOAD_EXTENSION -DSQLITE_DEFAULT_MEMSTATUS=0 -DSQLITE_OMIT_DEPRECATED -DSQLITE_ENABLE_JSON1(default on)`, WAL on desktop. ESP32 and PS targets get
a small key-value `zinc:storage` over NVS/LittleFS instead (SQLite flash cost too high for ~300 KB RAM). Risk: allocation: route `sqlite3_config(SQLITE_CONFIG_MALLOC)` to mimalloc. Integration: `plugins/sqlite` links it, task **ZN-063 "zinc:sqlite on the next engine"**.

---

## 7. WebAssembly (`WebAssembly` global)

| Candidate | Licence | Size | Release / adoption | Speed [bg, upstream claims] | Targets | Fit |
|---|---|---|---|---|---|---|
| **wasm3** | MIT | ~64 KB code, 10 KB min RAM | v0.9.1-beta.1, 2026-09-10, 8k stars [V]; already in `plugins/wasm/vendor` | Fastest pure interpreter: ~4-15x slower than JIT, ~10x native; WAMR fast-interp is in the same class | ESP32, armv6, anything with a C compiler; no JIT, so iOS legal | MVP + bulk memory, sign-ext, tail calls; no SIMD, no GC, no threads, no multi-memory |
| WAMR (wasm-micro-runtime) | Apache-2.0 with LLVM exception | ~50-85 KB interp, bigger with AOT/JIT | WAMR-2.4.5, 2026-06-29, 6.1k stars [V] | Classic + fast interpreter, AOT (needs `wamrc`, LLVM), SIMD, threads, GC, WASI | ESP32, Zephyr, Linux, Pi | CMake with many options; larger API surface |
| wasmtime | Apache-2.0 with LLVM exception | ~15-20 MB | v49.0.2, 2026-10-02, 18.7k stars [V] | Cranelift JIT, near native | x86-64, aarch64 only; no armv6, no ESP32; Rust | C API fine; size and Rust kill it |
| wasmi | MIT/Apache-2.0 | ~1 MB Rust | v2.0.0, 2026-09-01 [V] | Fast interpreter in Rust | Rust toolchain | Reject: toolchain |

**Decision: wasm3 for the baseline `WebAssembly` implementation** (already vendored, MIT, smallest, runs everywhere including ESP32; the whole plugin exists) **and WAMR 2.4.5 as the
named upgrade path** the day a user needs SIMD/threads/GC/AOT-compiled modules (desktop plugin `wasm-fast`, same `zinc:wasm` surface). No wasmtime/wasmi.
**Risks.** wasm3 had a maintenance lull; the 2026 beta shows life but pin the commit. JS API shape (`WebAssembly.instantiate`, `Memory`, `Table`, `Global`, exceptions) is our binding code: test with the WebAssembly spec testsuite (section 18), not just toy modules. Run the "Benchmarks Game" wasm cases once to replace the bg claims.
**Integration.** Move `plugins/wasm/vendor/wasm3` to `next/third_party/wasm3` with README entry; **ZN-064 "WebAssembly JS API on wasm3 + spec tests"**.

---

## 8. FFI

| Candidate | Licence | Size | Release | Fit |
|---|---|---|---|---|
| **libffi** | MIT | ~120 KB code with asm per arch | v3.8.0, 2026-08-08, 4.4k stars [V] | x86-64, aarch64, arm, mips, xtensa..., struct passing, variadics, closures (callbacks) |
| dyncall | ISC | ~60 KB | 1.4 (2022) [bg]; hosted at dyncall.org; no GitHub release to verify | Many archs including MIPS/PSP; C API simpler; callbacks in `dyncallback`; less used |
| own dlopen + scalar/string signature table | ours | ~600 lines (already `plugins/ffi`) | n/a | Works for scalar and string signatures only: no structs by value, no callbacks, no floats beyond what the switch covers |

**Decision: keep `dlopen`/`dlsym` as the loader (stdlib, a 40-line portability layer) and use libffi 3.8.0 for the call and closure machinery** on macOS, Linux x86-64/aarch64/armhf.
It replaces the hand-written signature switch (the part that is "reinventing the wheel" and has the corner cases: struct returns, variadics, callbacks) with the standard; dyncall is the
fallback if libffi's per-arch generated `fficonfig.h` proves too hard to vendor. ESP32, PS1/PS2 and iOS: no dynamic FFI; their natives are linked statically through the host table.
**Risks.** libffi is autoconf-generated: vendor pre-generated `fficonfig.h` + `ffi.h` per OS/arch under `third_party/libffi/<target>/` and compile the `.S` files with `zig cc` (tested upstream; verify in the cross CI). Closures need executable memory: macOS needs `MAP_JIT` (same trick as the existing JIT), hardened runtime entitlement `com.apple.security.cs.allow-jit` for notarization.
**Integration.** `plugins/ffi`; **ZN-065 "zinc:ffi on libffi"**. Checksum: sha256 of the release tarball `libffi-3.8.0.tar.gz` (upstream `releases/tag/v3.8.0`).

---

## 9. Audio/video decode

**FFmpeg: not vendored.** libavcodec/libavformat are LGPL-2.1+ (and several decoders GPL when built `--enable-gpl`); static linking makes the app combined with LGPL obligations (relinking), the build is configure-heavy,
and H.264/HEVC/AAC carry patent royalties. Allowed only as a **separately loaded plugin** (user-supplied or system `libav*.dylib/.so`, `dlopen`) for desktop power users.

| Need | Candidates | Facts | Pick |
|---|---|---|---|
| Audio device + decode | **miniaudio** 0.11.25 (public domain / MIT-0; single header ~4 MB source; WAV/FLAC/MP3 via embedded dr_libs, Vorbis through stb_vorbis; backends CoreAudio/ALSA/Pulse/WASAPI/...) [V release 2026-03-03, 7.3k stars]; minimp3 (CC0, 1 header ~95 KB, last push 2026-07 [V]); stb_vorbis (public domain, 2k lines); SDL3 audio (zlib, already linked for window) | miniaudio covers device I/O and decoding with no dependency; works on Pi 1 (ALSA), macOS, Linux; ESP32 uses I2S via ESP-IDF + minimp3 | **miniaudio** for desktop/Pi; **minimp3** on small targets |
| Video decode | VideoToolbox (macOS system), V4L2 stateful M2M (Pi 3B+/4 H.264, rMPP none), dav1d 1.x (BSD-2, AV1; C fallback slow, ASM needs nasm) [V BSD-2], openh264 v2.6.0 (BSD-2; patent-free only through Cisco's own binary download), libvpx v1.17.0 (BSD-3, VP8/VP9) [V], pl_mpeg (MIT-style, MPEG-1 + MP2, 1 header; fits PS2 and Pi 1) [V 942 stars, last push 2025-12], MJPEG via stb_image/libjpeg-turbo | Hardware decode first: no licence risk, no CPU. Software is for what hardware lacks | **Platform hardware decoders (VideoToolbox, V4L2 M2M)** as the primary path; **dav1d** (AV1, optional plugin, built with nasm-free C fallback or prebuilt) and **openh264 binary downloaded at run time from Cisco** (their patent grant covers only their binary) as software fallbacks; **pl_mpeg** and MJPEG for tiny targets |
| Containers | minimp4 (CC0) [V, pushed 2026-09], libwebm (BSD-3), own Ogg via stb_vorbis | MP4 demux needed for any H.264/AAC file | **minimp4** + libwebm later |

**Risks.** Patents: do not statically ship an H.264/HEVC/AAC software decoder. Hardware decoders differ per OS: the `zinc:video` interface must be "decode to texture/frame, ask the platform", with `HAL` implementations, not a codec zoo. dav1d's assembly needs nasm on x86: ship prebuilt static libs per target from CI to keep "no install".
**Integration.** `plugins/audio` (new; miniaudio) and `plugins/video` (exists) with `video.macos.mm` (VideoToolbox), `video.v4l2.cpp`; tasks **ZN-066 audio on miniaudio**, **ZN-067 video decode backends**.

---

## 10. Font rasterization, shaping and text layout

| Candidate | Licence | Size | Release | Notes |
|---|---|---|---|---|
| **stb_truetype** | public domain / MIT | 1 header ~190 KB source (v1.26) [V], ~30 KB code | no releases, 34.8k stars on `nothings/stb` [V]; v1.26 header | TrueType glyph outlines/`glyf` + basic CFF; glyph-index API (works with HarfBuzz output); no hinting, no CFF2, no variable fonts, no COLR |
| FreeType | FTL (BSD-like) or GPLv2 | ~800 KB source, 250-500 KB code with modules chosen | VER-2-14-3 [V gitlab tag]; 905 stars (GitHub mirror) | Everything (hinting, CFF2, variations, color); too heavy for small targets; build is autoconf/meson (vendor the 15 needed `.c` files, officially supported "single-file" `ftsystem` recipe) |
| **HarfBuzz** | MIT | `harfbuzz.cc` amalgamation ~ 1.2 MB source, 400-700 KB code (HB_TINY ~250 KB) [bg] | 14.6.0, 2026-10-05, 6.1k stars [V] | The shaper (Arabic, Indic, ligatures, kerning, GPOS); has its own OpenType parser, so FreeType is not required |
| **SheenBidi** | Apache-2.0 | ~120 KB | v3.0.0, 2026-01-24, 225 stars [V] | UAX9 bidi, standalone C |
| libunibreak | zlib | see 2 | 8.0 | line breaking |
| own `runtime/ttf.cpp` (332 lines) | ours | | | cmap + glyf + hmtx only; no kerning, no GSUB/GPOS, no fallback |

**Decision.**
- **Raster: stb_truetype 1.26** on every target (it is the TrueType rasterizer the owner's own code approximates; same class of output, public domain, tiny).
- **Shaping tier "text-complex": HarfBuzz 14.6.0 + SheenBidi 3.0.0 + libunibreak 8.0**, built as a desktop/Pi plugin, off on ESP32/PS. Glyph ids from HarfBuzz are drawn with stb_truetype by glyph index (`stbtt_MakeGlyphBitmap`); no FreeType.
- **Simple tier (all targets):** stb_truetype `kern`-table advances + libunibreak, no shaping.
- **FreeType rejected for now**, adopt only if the product needs hinting, CFF2/variable fonts or color emoji (COLR/CBDT): then as a plugin replacing the glyph rasterizer, FTL licence.
- **Atlas and baking:** `src/res` keeps baking glyph atlases at build time (ZN-048); the baker switches its glyph source from the ported TS rasterizer to stb_truetype.

**Risks.** (1) Pixels change: goldens of every example re-bake; do it in one commit with the old rasterizer kept as the oracle for ASCII only if a diff is wanted. (2) HarfBuzz build flags (`HB_NO_*`) need curation; at ~500 KB it is the largest text piece: lazy-link only when a text run contains non-simple scripts. (3) Color emoji not covered. (4) Editor needs IME preedit and grapheme cursor movement: libunibreak graphemes (`docs/reports/research-2026-09-30/code-editor-lsp.md`).
**Integration.** `src/res` (stb_truetype swap, **ZN-068 "stb_truetype in the baker"**), `plugins/text` (HarfBuzz, SheenBidi, libunibreak, **ZN-060**).

---

## 11. Vector graphics, SVG, Lottie

| Candidate | Licence | Size | Release / adoption | Features | Embedded / speed |
|---|---|---|---|---|---|
| **ThorVG** | MIT | ~150-300 KB code SW-only build (LVGL ships it for MCU) [bg] | v1.1.2, 2026-09-18, 1.9k stars [V]; used by LVGL, Godot, Tizen, Samsung | Vector engine, SVG, **Lottie (incl. expressions subset)**, fills/strokes/gradients/masks/blends, text, SW rasterizer (SIMD NEON/AVX), GL and WebGPU backends | Runs on MCUs (LVGL), Pi, desktop; C++14, `-fno-exceptions` OK; meson build (vendor file list) |
| lunasvg (+ plutovg) | MIT | ~80 KB code | v3.5.0, 2025-09-14, 1.2k stars [V] | SVG 1.1 + CSS; no Lottie | desktop/Pi; C++17 |
| nanosvg | zlib | 2 headers ~3k lines | no releases, 2k stars, pushed 2026-07 [V] | Basic SVG paths, gradients; no text/CSS/filters/clip masks | Tiny, good for MCU; low fidelity |
| Blend2D | zlib | ~800 KB code | no release tags in GitHub, 2k stars [V] | Fastest software 2D (JIT via AsmJit, multithreaded) | x86 and aarch64 only (no armv6, ESP32) |
| rlottie (Samsung) | MIT + parts | ~300 KB | v0.2, 2020-08-19 [V]; moribund | Lottie only | stale |
| AGG 2.4 | BSD-like | ~100 KB | unmaintained | rasterizer only | fine, but nothing to adopt |
| Skia | BSD-3 | 10-30 MB | | everything | rejected (size) |
| Vello | Apache-2.0/MIT | Rust + GPU compute | | | rejected (Rust, GPU only) |
| lottie-web | MIT | JS 300 KB | | Reference semantics, runs in JS | use as the test oracle for rendering, not as the runtime |

**Decision: ThorVG 1.1.2** for SVG and Lottie in one dependency; renderer = ThorVG software engine writing into our framebuffer (`Gfx` table), GL engine optional on the GPU path. It replaces the owner's own `plugins/svg` and `plugins/lottie` implementations (which duplicate a library) on all targets that fit; ESP32/PS keep the existing minimal own code or nanosvg until measured. Blend2D is the upgrade path only if the profile shows ThorVG's rasterizer limits desktop canvas speed.
**Risks.** Pixel goldens for SVG/Lottie change; compare against lottie-web screenshots instead of the old output, accept a tolerance. ThorVG version churn (1.x is new): pin 1.1.2, upgrade rarely. Text in SVG needs fonts: feed our baked fonts through ThorVG's loader API.
**Integration.** `plugins/vector` (new; ThorVG), thin adapters `zinc:svg`, `zinc:lottie`; **ZN-069 "ThorVG for svg and lottie"**.

---

## 12. Image decode/encode

| Candidate | Licence | Size | Release | Notes |
|---|---|---|---|---|
| **stb_image / stb_image_write** | MIT or public domain | `stb_image.h` 283 KB [V], ~60 KB code | v2.30 pinned (commit 2c980bb, master head `2c980bb` [V]); 34.8k stars | PNG, JPEG (baseline + progressive), GIF, BMP, TGA, PSD, HDR, PIC; 2-4x slower than libjpeg-turbo; no WebP/AVIF; already vendored (PNG only) |
| libjpeg-turbo | BSD-3 / IJG / zlib | ~450 KB source, ~200 KB code | 3.2.0, 2026-06-30, 4.4k stars [V] | SIMD (NEON, SSE2/AVX2: x86 needs nasm, can be disabled) 2-6x faster than libjpeg |
| libpng | libpng licence (zlib-like) | ~250 KB + zlib | 1.6.x stable; 1.7.0beta89 as newest tag [V] | Reference; needs zlib |
| libwebp | BSD-3 | decoder ~200 KB code; encoder +300 KB | v1.6.0 [V tag] , 2.4k stars | Lossy/lossless/animated WebP |
| spng | BSD-2 | ~50 KB + miniz/zlib | v0.7.4, 2023-05 [V] | Fast PNG decode/encode (SIMD) |
| lodepng | zlib | 1 file ~300 KB source | pushed 2026-10 [V], 2.3k stars | PNG only, small, slow |
| libultrahdr, libavif, basis_universal | | | | later: HDR, AVIF, GPU textures |

**Decision: stb_image + stb_image_write for PNG/JPEG/GIF/BMP/TGA (enable all formats, they are `#define`s)** on all targets, one pinned header; **libwebp 1.6.0 (decode and encode) as a `plugins/image-webp`**; **libjpeg-turbo 3.2.0 only on a measured need** (photo-heavy desktop apps), selected at build time behind the same `zn::image` interface. libpng/spng/lodepng not needed (stb covers PNG; spng is the upgrade if PNG decode shows in profiles). AVIF/HEIC out of first cut (patent and size).
**Risks.** stb_image has no memory limits by default and has had CVEs on malformed input: set `STBI_MAX_DIMENSIONS`, fuzz it (section 19). Colour management/ICC ignored.
**Integration.** `third_party/stb/stb_image.h` (extend define set), `src/res` and `plugins/image`; tasks ZN-048 (done for PNG) plus **ZN-070 "JPEG/GIF/WebP decode and encode"**.

---

## 13. GPU rendering path, windowing, input

| Candidate | Licence | Size | Release / adoption | Fit |
|---|---|---|---|---|
| **Software rasterizer (existing `runtime/raster.cpp`, `src/host`)** | ours | | | Reference output (pixel goldens), runs on fbdev, e-ink, ESP32, PS2; must stay |
| **GLAD 2** | MIT (generator) / output public domain | generated loader ~100-300 KB per profile | v2.0.8, 2024-09-29, 4.6k stars [V] | GL 3.3 core / GLES 3.0 loader generated for exactly the functions we call; no dependency at run time |
| sokol_gfx | zlib | single header ~ 20k lines | no tags (`pre-webgpu`), 10.3k stars, pushed 2026-10-06 [V] | GL3.3, GLES3, Metal, D3D11, WebGPU; shaders via `sokol-shdc` (offline, MIT [V]); no Vulkan |
| bgfx | BSD-2 | ~ 3-5 MB source | pushed 2026-10-05, 17.5k stars [V] | Very broad; own shader language and `shaderc` tool chain; bx/bimg/bgfx build (genie); heavy |
| SDL_gpu (in SDL3) | zlib | in SDL3 | SDL 3.4.18, 2026-10-02 [V] | Vulkan, Metal, D3D12; **no GLES/GL**: excludes Pi 1/3, needs SDL_shadercross for shaders |
| ANGLE | BSD-3 | 10+ MB, gn/depot_tools | Chromium | Reject: build and size (research-2026-09-30 noted it for WebGL on macOS: only if WebGL2 is a goal) |
| wgpu-native | Apache-2.0 / MIT | 10-20 MB prebuilt | v29.0.1.1, 2026-06-23, 1.4k stars [V] | Rust; not for small targets |

**Windowing/input:** **SDL3 3.4.18 (zlib, 16.7k stars [V])** vs GLFW 3.5.1 (zlib, 15.4k stars [V]). GLFW has no IME text input or composition, no audio, weak gamepad/touch, no KMSDRM on Pi. SDL3 gives window, GL/GLES/Metal contexts, input, IME, clipboard, gamepad, touch, DPI, KMSDRM for Pi with no X11, audio device. The existing `hal_sdl.cpp` already uses SDL3 [V per research].

**Decision.**
1. **Software rasterizer stays the reference and the only path on small targets and e-ink.**
2. **GPU path = OpenGL 3.3 core / GLES 3.0 through GLAD 2.0.8 behind `zn::host::Gfx`**, targets macOS (legacy GL still works but deprecated), Linux, Pi 4/5. A **Metal backend** later for Apple long term through the same table. Not bgfx (shader toolchain), not wgpu, not ANGLE. sokol_gfx is the "if we want one API for GL+Metal+D3D" alternative and is the first to evaluate when Metal is demanded (zlib, single header, no run-time dependency): decision deferred with a one-day spike.
3. **SDL3 3.4.18, vendored statically**, window + input + clipboard + IME; `-DSDL_SHARED=OFF`, X11/Wayland loaded with `dlopen` at run time (SDL's default) so no runtime libs.
**Risks.** Static SDL3 needs platform headers at build time (X11, Wayland, ALSA, libdrm): provide **prebuilt static SDL3 per target built in CI** and stored like `firmware/esp32/prebuilt`, plus a build-from-source option; verify with `zig c++` cross builds (the research said SDL3 link was untested). macOS: link frameworks, notarized binaries fine. GL on macOS is frozen at 4.1 and deprecated: keep the Metal door open. Goldens from the GL path will never match the software path bit-for-bit: keep separate golden sets and tolerance.
**Integration.** `third_party/sdl3/` (or `prebuilt/`), `src/host/hal_sdl.cpp`, `src/host/gl_backend.cpp`; tasks ZN-047 (live window and input, done) and **ZN-071 "Static SDL3 and GLAD GL path"**.

---

## 14. 3D

| Candidate | Licence | Size | Release | Notes |
|---|---|---|---|---|
| **Own scene graph** (three.js-like API in `plugins/three`) | ours | | | The API semantic of three.js (Object3D, Camera, Material, Scene) is the product; no library offers the same API in C++ |
| **cgltf** | MIT | 1 header ~ 7k lines | v1.15, 2025-02-09, 2k stars [V] | glTF 2.0 parser, no deps, C99, no JSON library needed; buffers/accessors/animations/skins |
| tinygltf | MIT | ~ 10k lines + JSON + stb | v3.0.1, 2026-08-02, 2.5k stars [V] | Parser + writer; heavier |
| assimp | BSD-3 | 5-10 MB | v6.0.5, 2026-04-30, 13k stars [V] | 40+ formats; too big for runtime, fine as an offline converter (not shipped) |
| **meshoptimizer** | MIT | decoders ~30 KB; whole lib ~ 300 KB | v1.3, 2026-09-25, 8.5k stars [V] | `EXT_meshopt_compression` decode, vertex/index codecs, simplification, optimization (offline) |
| Draco / Basis Universal / KTX-Software | Apache-2.0 | big | | Later: Draco decode and `KHR_texture_basisu` |

**Decision: keep our own scene graph and renderer; adopt cgltf v1.15 for glTF/GLB loading and meshoptimizer v1.3 for `EXT_meshopt_compression` decode (and for the offline asset bake: simplify, vertex cache optimize).** Textures through stb_image. No assimp in the runtime.
**Risks.** three.js compatibility is the compatibility target of `plugins/three`: loaders, `GLTFLoader` semantics must match (KHR_materials_*, KHR_texture_transform, skinning). Rendering parity depends on the GL path (13) and a WebGL2 layer (research-2026-09-30 threejs-webgl.md).
**Integration.** `plugins/three` (cgltf, meshoptimizer), `tools/zn-bake-gltf` for offline; **ZN-072 "glTF loading via cgltf and meshoptimizer"**.

---

## 15. Map vector tiles

| Candidate | Licence | Size | Release | Notes |
|---|---|---|---|---|
| **protozero** | BSD-2 | headers ~ 100 KB | v1.8.2, 2026-06-30 [V] | Zero-copy protobuf reader/writer |
| **vtzero** | BSD-2 | headers ~ 80 KB | v1.2.0, 2025-01-13 [V] | Mapbox Vector Tile (MVT) decode over protozero: layers, features, geometry decoding |
| **earcut.hpp** | ISC | 1 header 48 KB [V] | v3.2.4, 2026-09-28, 1k stars [V] | Polygon triangulation, header-only |
| **Clipper2** | Boost (BSL-1.0) | ~300 KB source | Clipper2_2.0.1, 2025-12-19 [V] | Polygon clipping, offsetting (buffering line to polygon, tile clip) |
| maplibre-native | BSD-2 | 100s of MB with deps | android-v13.5.2 etc., 2.3k stars [V] | Full map renderer: carries GL/Metal/Vulkan backends, ICU, rapidjson, protozero...; replaces our own `plugins/map` rather than being a library |
| mapbox-gl-native | BSD-2 | archived | | superseded by maplibre |

**Decision: protozero + vtzero for MVT decoding, earcut.hpp for fill triangulation, Clipper2 only for line buffering and tile-edge clipping if needed.** Keep our own style evaluation (MapLibre style spec subset) and renderer in `plugins/map`: adopting maplibre-native as a whole would swallow the engine (its own GL stack). Gzip tiles: zlib/miniz.
**Risks.** Style expression parity with MapLibre is the real work (data-driven expressions, `step`/`interpolate`, layout of symbols with text: needs section 10); vtzero is read-only and tile-by-tile. Tile cache: SQLite (MBTiles) from section 6.
**Integration.** `plugins/map` uses them; existing `examples/maps/navigation` is the test; **ZN-073 "MVT decoding on vtzero and earcut"**.

---

## 16. E-ink drivers, GPIO, I2C, SPI

| Candidate | Licence | Notes |
|---|---|---|
| **Linux kernel uAPI**: `<linux/gpio.h>` (GPIO chardev v2), `<linux/i2c-dev.h>`, `<linux/spi/spidev.h>` | kernel UAPI headers are GPL-2.0 WITH Linux-syscall-note: usable by any licence | Stable ABI, zero dependency, same on Pi 1 to Pi 5 and rMPP; ~300 lines wrapper |
| libgpiod 2.x (v2.3.1 tag [V]) | **LGPL-2.1** | Nice wrapper over the same ioctls; LGPL: only as a separately loaded plugin; not needed |
| pigpio | Unlicense | v79, 2021-03 [V], no Pi 5, needs daemon/root; unmaintained => reject |
| lgpio (joan2937/lg) | Unlicense | v0.2.2, 2026-02 [V], 129 stars; Pi 5 capable; small; fallback |
| bcm2835 lib, WiringPi | GPL / deprecated | reject |
| Waveshare e-Paper drivers (`waveshareteam/e-Paper`) | MIT-style headers per file (no SPDX on GitHub [V]: verify each file) | C drivers for every panel (init sequences, LUTs, refresh modes) |
| GxEPD2 (Arduino) | **GPL-3.0** [V] | Reference reading only; do not copy |
| ESP-IDF `driver/spi_master`, `i2c_master`, `gpio` | Apache-2.0 | ESP32 side |

**Decision: no GPIO library.** Use the kernel UAPIs on Linux (gpio chardev v2, i2c-dev, spidev; `mmap /dev/gpiomem` only for Pi 1 timing-critical toggles) and ESP-IDF drivers on ESP32, behind `zn::hal::{Gpio,I2c,Spi}`. **E-ink panel drivers: vendor Waveshare's C drivers panel by panel** (init sequence, LUT, partial refresh), one file per panel in `plugins/display-epd/`, each with its licence header checked and recorded; panel-specific tuning is data, not a library. The existing `display-ssd1306`, `st7789`, `ws2812` plugins remain.
**Risks.** Licence per Waveshare file is not machine-readable: audit before vendoring; e-ink waveforms for rMPP stay in `display-rmpp` (own). LGPL libgpiod is avoided, not banned.
**Integration.** `src/host/hal_gpio_linux.cpp`, `plugins/display-epd`; task ZN-055 (hardware validation) and **ZN-074 "GPIO/I2C/SPI HAL on kernel UAPI + e-paper drivers"**.

---

## 17. A JIT for the bytecode interpreter

**Facts from this repo.** The prototype JIT (`runtime/vm/jit.h`, 216 lines, AArch64 only) inlines int/f64 ops, calls the interpreter for everything else, pins registers only in leaf functions. fib(32): interpreter 130 ms, JIT 66 ms, AOT 31 ms, native 10 ms [research-2026-09-30-all.md]. The new engine's typed interpreter is already **5.4x (fib), 5.4x (nbody), 6.9x (mandelbrot) QuickJS**, and AOT is within 1.15-2.9x of native (zinc-next-m4-benchmarks.md, zinc-next-perf.md) [V]. iOS forbids JIT; the owner's targets with an executable heap (macOS, Linux, Pi, rMPP) are the only JIT beneficiaries; ESP32 and PS cannot (flash-only code or W^X).

| Candidate | Licence | Size | Release / adoption | Targets | Verdict |
|---|---|---|---|---|---|
| Hand-written baseline / copy-and-patch JIT (x86-64 + AArch64) | ours | 3-6k lines [bg] | n/a | x86-64, AArch64 | Highest control, ongoing cost on 2 ISAs and 2 ABIs, no armv6/32-bit |
| **sljit** (Zoltan Herczeg, used by PCRE2 JIT, JavaScriptCore regexp earlier, Mono) | BSD-2 | 1 C file set ~ 400 KB source, ~100 KB code | active (pushed 2026-09-30) [V]; no GitHub releases | x86-32/64, ARM32/Thumb2/AArch64, PPC, MIPS, RISC-V, s390x: **includes armv6/armv7**, no external deps | Best "portable low-level assembler" fit |
| asmjit | zlib | ~ 1 MB | pushed 2026-09-22, 4.6k stars [V] | x86/x64/AArch64 | Great assembler API, no register allocator beyond compiler layer; no 32-bit ARM |
| DynASM (LuaJIT) | MIT | tool + headers | LuaJIT pushed 2026-09 [V] | x86, x64, ARM, ARM64, MIPS, PPC | Powerful (LuaJIT, Mike Pall); Lua preprocessor step (build tool); per-ISA assembly written by hand |
| MIR (vnmakarov) | MIT | ~ 500 KB source | v1.0.0, 2024-05-27, 2.7k stars [V] | x86-64, AArch64, ppc64, s390x, riscv64 | Real compiler (C-like speed ~ 0.6-0.8x gcc -O2 [bg upstream]), generates in ms; no armv6 |
| LLVM ORC | Apache-2.0 + exceptions | 100+ MB | llvmorg-23.1.3 [V] | all | Reject: size, no install |
| libgccjit | GPL-3 + runtime exception | needs gcc | | | Reject: GPL, install |
| Cranelift (via wasmtime) | Apache-2.0 | 15 MB, Rust | v49.0.2 [V] | x86-64, AArch64, s390x, riscv64 | Reject: size, Rust; would also force going through wasm |
| Prototype AArch64 JIT | ours | 216 lines | | AArch64 only | Learning value; absolute address immediates, helper-call design |

**Is a JIT worth it?** **Not now.** With AOT at 1.15 to 2.9x native and the typed interpreter at 5x QuickJS, a JIT only helps the case where AOT is unavailable: **dynamic code loaded at run time on a desktop** (REPL, plugin code, Atelier live-edit) and CPU-heavy interpreter hot loops on a target that cannot run `zig c++`. Both are the minority; AOT already covers "I want speed". The JIT is also illegal on iOS and unreachable on ESP32/PS, so it cannot be the single answer: cost-to-benefit is poor at 60-100 days (the research estimate for QuickJS' JIT is also that range, high risk) [bg + V].

**Recommendation (in order).**
1. **Do nothing now; invest in interpreter and AOT (quick wins in `zinc-vm-aot.md` section 4: register allocation in the emitter, 32-byte `Ins`, cheaper `CALL`).**
2. If the live-edit/REPL case demands speed: **sljit-based baseline JIT for hot numeric functions only** (typed int/f64 ops and calls to the interpreter for the rest, the same split as the prototype), 1.5-2.5k lines, runs on x86-64, AArch64 **and** armv7; BSD-2, vendors as ~10 files, no build step. Gate it behind `ZN_JIT` and keep the interpreter the oracle (four-mode parity matrix). Expected gain: 1.5-2x over the interpreter on numeric loops (the prototype got 2x on fib with far less than a full design [V]), which is less than what AOT gives for free.
3. Do not write a hand-made AArch64 + x86-64 JIT: two ISAs of encoders and ABIs to own forever when sljit does it; do not use DynASM (needs a Lua build step and per-ISA assembly), asmjit (no 32-bit ARM), MIR (no armv6, a whole compiler; consider only if the AOT backend ever needs "no clang at run time").
4. Keep the prototype JIT as a design reference only; do not port its absolute-address immediates (`runtime/vm/jit.h:155,161,173`) into the new engine.
**Integration.** If go: `src/jit/` (new module right of `vm`, includes `rt`, `vm`), task proposed **ZN-075 "sljit baseline JIT, spike with go/no-go on fib/nbody/mandelbrot and a UI frame"**, after the profile of a real Zinc UI app (the research says that profile has never been done).

---

## 18. Test and conformance corpora

| Corpus | Licence | Size / activity | What it checks | Use |
|---|---|---|---|---|
| **test262** (tc39/test262) | BSD-3 | ~50k tests, 2.8k stars, pushed 2026-10-06 [V] | ECMAScript semantics | Adopt a **subset** run on the QuickJS engine path (`--engine quickjs`) and on the typed engine for the tests it can express: `language/expressions`, `language/statements`, `built-ins/{Array,String,Number,Math,JSON,RegExp,Map,Set,Date}`; ship a harness that reads `includes:`, `flags:`, `negative:`, plus an expectations file (`next/corpus/test262-expected.txt`) of known failures. Pin a commit and vendor only the selected directories (sha list), not the whole tree (~ 100 MB) |
| **WebAssembly spec testsuite** (WebAssembly/testsuite) | Apache-2.0 | 249 stars, pushed 2026-09-15 [V] | `.wast` -> run through `wast2json`/wabt (offline) and the wasm3 binding | Adopt for ZN-064; the `.json` + `.wasm` outputs are the vendored artifacts |
| **WPT** (web-platform-tests) | BSD-3 | huge; use `url/resources/urltestdata.json`, `encoding`, `dom/abort`, `fetch/api` subsets | URL parsing (WHATWG), TextEncoder, AbortController, Headers, JSON | Adopt **URL data and encoding tests only** (JSON data files, small); pin a commit |
| **Benchmarks Game** | 3-clause BSD | ~10 programs | Perf | Already used (fannkuch, nbody, spectralnorm, binarytrees, mandelbrot per `zinc-next-m4-benchmarks.md`); keep as the perf oracle, add `regex-redux`, `k-nucleotide`, `fasta` after ZN-058 |
| Regex: test262 `built-ins/RegExp` + `regexp-unicode-property-escapes` | BSD-3 | generated | `\p` correctness | with 1 |
| Ecosystem: JSON test suite (nst/JSONTestSuite MIT; "y_/n_/i_" files) | MIT | 300 files [bg] | JSON parse conformance | for yyjson wrapper |
| Net: HTTP request smuggling vectors | | | | for llhttp glue |

**Decision: test262 subset + WPT URL/encoding data + wasm testsuite + JSONTestSuite + Benchmarks Game**, each as pinned data under `next/corpus/<name>/` with a manifest sha256 and a runner in `tests/t1` or `tests/t2` (nightly), never all at once in T0.
**Risks.** Typed Zinc does not support every JS feature (test262 tests untyped dynamic code): run on QuickJS path for full ES, on the typed engine only a curated list; a failing-expected list must be reviewed, not auto-grown. Licence of test262 files: BSD-3 with per-file "Copyright" headers; keep them.
**Integration.** `next/tests/t2/test262.sh`, `next/corpus/`; **ZN-076 "Conformance corpora: test262 subset, WPT URL, wasm spec, JSONTestSuite"**.

---

## 19. Fuzzing and sanitizers

| Candidate | Licence | Notes |
|---|---|---|
| **libFuzzer** (in LLVM/clang, `-fsanitize=fuzzer`) | Apache-2.0 w/ LLVM exception | In-process, no install beyond clang; works with ASan/UBSan which the repo already uses (`next/build-san`); Apple clang ships it only in Xcode toolchains? Not in Apple clang: needs upstream clang (Homebrew `llvm`) or `zig c++` (zig bundles compiler-rt libFuzzer? partial, unverified) [bg] |
| AFL++ v5.03c | **AGPL-3.0** [V] (tool, not linked into our binary; the output corpora are ours) | Best for coverage-guided binary mutation with persistent mode; the licence applies to the tool only; allowed as an external dev tool, not vendored |
| honggfuzz | Apache-2.0 | alternative, less used |
| OSS-Fuzz (google/oss-fuzz, Apache-2.0, 12.7k stars [V]) | | Continuous fuzzing for free once the project is public and has a build script: Atelier engine is a candidate |
| Sanitizers: ASan, UBSan, MSan, TSan (compiler-rt) | | Already in use (`build-san`); add TSan for `plugins/net` threadpool |
| Grammar-aware: Fuzzilli (JS engine fuzzer, Apache-2.0) | | Targets JS engines with FuzzIL; relevant for the QuickJS path only |

**Decision: libFuzzer harnesses (clang) + ASan/UBSan, built as `tests/fuzz/<target>.cpp`** for: the lexer/parser (`src/frontend`), the ZBC verifier and loader (`src/zbc`), the upload protocol (`src/dev`), JSON (wrapper), HTTP glue, image decode (stb), IR text parser. Seeds from `tests/golden` and `next/corpus`. AFL++ used only as an external tool when a harness needs persistent-mode scaling (not vendored, tool licence AGPL). `-fsanitize=fuzzer` on `zig c++`: verify; fall back to `brew llvm` on the developer machine and CI Linux clang (this is a developer tool, not a user install). Nightly: 10 minutes per target; crashes become `tests/regress/` files.
**Risks.** The ZBC verifier must exist and be total (every malformed program rejected before `exec`): fuzzing it is how that is proven; ZBC format stability is ZN-052.
**Integration.** `next/tests/fuzz/`, CMake option `ZN_FUZZ`; **ZN-077 "libFuzzer harnesses for parser, ZBC verifier, upload protocol"**.

---

## 20. Packaging and updating (macOS and Linux; Windows out of scope)

| Candidate | Licence | Release | Notes |
|---|---|---|---|
| **Sparkle** | MIT-like (per-file; "NOASSERTION" on GitHub [V]) | 2.10.0, 2026-09-13, 9.8k stars [V] | Standard macOS updater: appcast XML, EdDSA signatures, delta updates, sandbox XPC; needs a framework bundled inside the app and notarization of it |
| Squirrel.Mac | MIT | 0.3.2, 2017 [V] | Stale: reject. (electron/windows-installer 5.4.4 [V] is Windows only: out of scope) |
| **AppImage + AppImageUpdate** | MIT | 2.0.0-alpha-1, 2025-10 [V], 733 stars; AppImageKit 9.4k stars | Linux single-file; zsync delta updates; needs FUSE2 on the host (Ubuntu 22.04+ lacks it) and some libs; still alpha |
| Flatpak / deb / rpm | | | Distro-specific; Flatpak sandbox complicates `/dev/*` access (e-ink dev tools) |
| Own updater (download + sha256 + signature + atomic swap) | ours | | Simple for a CLI/toolchain tool; the repo already has the checksum-verified download in `src/tc` |
| notarization tooling | | | `xcrun notarytool` + `stapler` (Apple, ships with Xcode), `codesign` hardened runtime; `rcodesign` (Rust, MPL-2.0) cross-platform but extra toolchain |

**Decision.** **macOS: `.app` in a DMG, hardened runtime, `codesign` + `xcrun notarytool submit --wait` + `stapler`, Sparkle 2.10.0 for in-app updates** (appcast on static hosting, EdDSA key kept offline). **Linux: a self-contained tarball and an AppImage** (zsync `.zsync` file for AppImageUpdate-compatible updates), static SDL3 and no external libs so it runs everywhere. **CLI/engine updates: our own** (`zinc update`: version manifest, sha256 + minisign/ed25519 signature check using mbedTLS, atomic swap), consistent with `src/tc`. Entitlement `com.apple.security.cs.allow-jit` only if the JIT ships; FFI closures may need it (section 8).
**Risks.** Apple Developer ID and a notary account are owner prerequisites (the repo cannot do it alone). AppImage FUSE requirement: provide `--appimage-extract-and-run` doc and the tarball. Sparkle updating an app that contains an engine, toolchains in `~/.zinc`: update the app only, keep toolchain cache separate.
**Integration.** `next/tools/package-*`, `app/atelier`; tasks ZN-053 (packaging, planned) and **ZN-078 "updater: Sparkle on macOS, zsync AppImage on Linux, signed zinc update"**. Decision text lives with `zinc-next-packaging.md`.

---

## 21. Windows

Out of scope for now; nothing here assumes Windows. libuv, SDL3, mbedTLS, miniaudio, ThorVG, ThorVG, HarfBuzz and SQLite all support it, so the choices do not close the door. (ZN-054 keeps the placeholder.)

---

## 22. Code editor widgets and LSP for the studio; syntax highlighting

| Candidate | Licence | Size | Release | Notes |
|---|---|---|---|---|
| **tree-sitter** (runtime) | MIT | `lib/src/lib.c` single TU ~ 200 KB source, ~80 KB code | v0.27.0, 2026-08-30, 27k stars [V] | Incremental parsing, error tolerant, queries (`highlights.scm`), C99, no deps; used by Zed, Neovim, Helix, GitHub |
| tree-sitter-typescript / -javascript grammars | MIT | ~ 1-2 MB generated `parser.c` each | v0.23.2 (TS), v0.25.0 (JS) [V] | Generated C parsers; vendor `parser.c` + `scanner.c` + `queries/highlights.scm` pinned |
| Lezer | MIT | JS only | 39 stars at `lezer-parser/lezer` [V] | CodeMirror 6's parser system: JavaScript, needs a JS engine and CodeMirror; fits a web-view editor, not a native `zinc:ui` widget |
| Own tokenizer (as in `examples/zed-editor/src/app/document.ts`) | ours | | | Works for the current demo; reparses from line 0; no TypeScript semantics |
| LSP | | | | Language server for Zinc: a `zinc lsp` mode over the existing frontend (`src/frontend` has `check`, `inspect`, `snippet`, diagnostics); LSP JSON-RPC over stdio uses yyjson |
| Editor widget | | | | CodeMirror 6 (MIT, JS) would need a web view and a JS engine; Monaco (MIT) same; both contradict "no webview shell" of decisions section 2. Own widget in `zinc:ui` (decided in `research-2026-09-30/code-editor-lsp.md`) |

**Decision: tree-sitter 0.27.0 (core) with tree-sitter-typescript 0.23.2 grammar for highlighting and structural selection in Atelier, run through the `highlights.scm` queries** (replaces the hand tokenizer and gives incremental updates on a rope/piece-table buffer that must also replace the single-string `Edit`). Other languages: add grammars as plugins (JSON, Markdown, C++, GLSL, Python...). **LSP:** implement `zinc lsp` natively over `src/frontend` (diagnostics, hover, go-to, completion from the checker), not tsserver; the studio talks to it over `zinc:process` stdio. **Editor widget:** own, in `zinc:ui` (virtualized rows, rope text, IME preedit); Lezer, CodeMirror and Monaco rejected (web tech).
**Risks.** Each grammar is 0.5-2 MB generated C: vendor only the grammars shipped; grammar version must match the runtime ABI (tree-sitter 0.27 reads language ABI 15 [bg]: verify with `ts_language_abi_version`). tree-sitter-typescript parses TS but not Zinc-specific syntax (decorators `@pooled`, `@weak`, type extensions): a thin Zinc grammar fork or accept highlight inaccuracies. Highlighting by tree-sitter is syntactic; semantic tokens come from the LSP.
**Integration.** `plugins/syntax` (tree-sitter + grammars), `app/atelier` editor, `src/lsp/` (new, includes `frontend` only); tasks **ZN-079 "tree-sitter highlighting plugin"** and **ZN-080 "zinc lsp over the frontend"**.

---

## Decision log

| # | Need | Choice | Version | Licence | Size (source / code) |
|---|---|---|---|---|---|
| 1 | Regex | QuickJS-ng libregexp + libunicode + cutils (split files, replacing the amalgam) | v0.17.0 | MIT | ~116 + 62 KB (+ tables ~250 KB) / ~70 KB |
| 2 | Unicode | libunicode (normalize, case, `\p`); libunibreak (line/word/grapheme) | v0.17.0; 8.0 | MIT; zlib | in 1; ~100 KB |
| 3a | JSON | yyjson | 0.13.0 | MIT | ~420 KB / ~120 KB |
| 3b | Number I/O | fast_float (parse), dragonbox (print) | v8.3.1; 1.1.3 | Apache-2.0/MIT/BSL; Apache-2.0/BSL | ~61 KB; ~100 KB headers |
| 4 | Net | libuv (loop), llhttp + own glue (HTTP), wslay (WebSocket), mbedTLS (TLS) | 1.53.0; v9.4.3; 1.1.1; 4.2.0 | MIT; MIT; MIT; Apache-2.0 | ~1.4 MB / ~300 KB; 100 KB; 60 KB; ~400 KB code |
| 5 | Crypto | mbedTLS TF-PSA-Crypto (+ OS entropy) | 4.2.0 / 1.2.0 | Apache-2.0 | ~150-250 KB code |
| 6 | SQLite | SQLite amalgamation | 3.53.4 (3530400) | Public domain | 9 MB / ~500 KB-1 MB |
| 7 | WebAssembly | wasm3 (WAMR 2.4.5 as upgrade) | v0.9.1-beta.1 | MIT | ~64 KB code |
| 8 | FFI | libffi + own dlopen | v3.8.0 | MIT | ~120 KB code |
| 9 | Audio / video | miniaudio; minimp3; VideoToolbox/V4L2; dav1d, Cisco openh264 binary as run-time plugins | 0.11.25; master pin; n/a; 1.x; 2.6.0 | PD/MIT-0; CC0; n/a; BSD-2; BSD-2 | ~4 MB / ~100 KB; 95 KB |
| 10 | Fonts and text | stb_truetype; HarfBuzz + SheenBidi + libunibreak (desktop tier) | 1.26; 14.6.0; 3.0.0; 8.0 | PD/MIT; MIT; Apache-2.0; zlib | 190 KB; ~1.2 MB / 400-700 KB; 120 KB; 100 KB |
| 11 | Vector, SVG, Lottie | ThorVG (SW raster); nanosvg for tiny targets | v1.1.2; pinned master | MIT; zlib | ~150-300 KB code |
| 12 | Images | stb_image + stb_image_write; libwebp plugin; libjpeg-turbo on demand | v2.30; 1.6.0; 3.2.0 | MIT/PD; BSD-3; BSD-3/IJG/zlib | 283 KB; ~200-500 KB; ~200 KB |
| 13 | GPU, window | Software raster (reference) + GLAD GL3.3/GLES3; SDL3 static | GLAD 2.0.8; SDL 3.4.18 | MIT/PD; zlib | generated ~200 KB; SDL ~1.5 MB code |
| 14 | 3D | Own scene graph; cgltf; meshoptimizer | v1.15; v1.3 | ours; MIT; MIT | 7k lines; ~30-300 KB |
| 15 | Map tiles | protozero + vtzero + earcut.hpp (Clipper2 optional) | 1.8.2; 1.2.0; 3.2.4; 2.0.1 | BSD-2; BSD-2; ISC; BSL-1.0 | headers ~230 KB (+300 KB) |
| 16 | GPIO / I2C / SPI / e-ink | Kernel UAPI (gpio chardev v2, i2c-dev, spidev); Waveshare C panel drivers | n/a; per panel | GPL-syscall-note headers only; MIT-style per file | ~300 lines + ~20 KB per panel |
| 17 | JIT | None now; if go, sljit baseline JIT | pinned commit | BSD-2 | ~400 KB / ~100 KB |
| 18 | Corpora | test262 subset; WPT url+encoding data; wasm testsuite; JSONTestSuite; Benchmarks Game | pinned commits | BSD-3; BSD-3; Apache-2.0; MIT; BSD-3 | data only |
| 19 | Fuzz | libFuzzer + ASan/UBSan; AFL++ as external tool; OSS-Fuzz | clang; v5.03c | Apache-2.0+exc; AGPL (not linked) | n/a |
| 20 | Packaging | Sparkle (macOS), AppImage + zsync (Linux), own signed `zinc update`, notarytool | 2.10.0; AppImageUpdate 2.0.0-alpha-1 | MIT-like; MIT | n/a |
| 21 | Windows | Out of scope | | | |
| 22 | Editor, LSP | tree-sitter + tree-sitter-typescript; own `zinc lsp`; own widget | 0.27.0; 0.23.2 | MIT; MIT | ~200 KB core / ~80 KB + grammar 1-2 MB |

## Rejected for licence (do not revisit without the owner)

mongoose (GPL-2.0 or commercial), wolfSSL (GPL-3.0 or commercial), GxEPD2 (GPL-3.0), libgpiod (LGPL-2.1, plugin-only if ever), FFmpeg libav* (LGPL/GPL, loaded plugin only), AFL++ (AGPL, external tool only), libgccjit (GPL-3), libconfig/libusb (LGPL), pigpio (unmaintained, not a licence issue), RapidJSON (stale).

## Cross-cutting risks

1. **Golden pixels.** Fonts (10), SVG/Lottie (11), GPU (13) each change pixels; do them one at a time with a re-bake commit and keep the software path as the reference.
2. **Build matrix.** libuv, libffi, SDL3, ThorVG, HarfBuzz, mbedTLS use CMake/meson/autoconf: vendor a **file list** per library in `third_party/<lib>/zn-sources.txt` and one `third_party/CMakeLists.txt` per target; verify every library with clang and `zig c++` for macOS arm64, Linux x86_64/aarch64/armhf in T2 CI; never require the user to run cmake/meson.
3. **Footprint.** The default `zinc` binary must not link what a program does not use: heavy libraries (HarfBuzz, ThorVG, mbedTLS, libuv, SQLite, libffi) are plugins linked on demand (the AOT "link the graphics host on demand" mechanism of ZN-045). ESP32 core stays at current size: only libregexp+libunicode (opt-in), yyjson, mbedTLS (via ESP-IDF), miniaudio-free.
4. **Unmeasured claims.** Every `[bg]` speed or size claim is to be replaced by a measurement in the task that adopts the library (benchmark file in `next/bench/`), per `zinc-next-profiling.md`.
5. **Maintainer-bus factor.** Single-maintainer projects: dragonbox, wasm3, wslay (stale since 2022), libunibreak, SheenBidi, stb. All are small, stable and vendored with source, so a freeze is survivable.

## Proposed task list (to create in `next/backlog/tasks`)

ZN-058 regex + String Unicode ops; ZN-059 JSON and number formatting; ZN-060 text shaping and layout; ZN-061 zinc:net; ZN-062 WebCrypto; ZN-063 zinc:sqlite;
ZN-064 WebAssembly + spec tests; ZN-065 zinc:ffi on libffi; ZN-066 audio; ZN-067 video backends; ZN-068 stb_truetype baker; ZN-069 ThorVG; ZN-070 image formats;
ZN-071 SDL3 static + GLAD; ZN-072 glTF; ZN-073 MVT; ZN-074 GPIO/I2C/SPI/e-paper; ZN-075 JIT spike (after a UI profile); ZN-076 corpora; ZN-077 fuzz; ZN-078 updater; ZN-079 tree-sitter; ZN-080 lsp.
Suggested order by value/risk: 059, 058, 070, 068, 061+062, 071, 063, 064, 069, 060, 076, 077, then the rest.

## Sources

Repository metadata queried through `gh api repos/<owner>/<repo>` on 2026-10-07 (tags, stars, SPDX, push date) for every project named above; file sizes from `raw.githubusercontent.com` at the tags given.
Upstream pages: https://github.com/ibireme/yyjson, https://github.com/simdjson/simdjson, https://github.com/fastfloat/fast_float, https://github.com/jk-jeon/dragonbox, https://github.com/ulfjack/ryu,
https://github.com/quickjs-ng/quickjs, https://github.com/JuliaStrings/utf8proc, https://github.com/adah1972/libunibreak, https://github.com/libuv/libuv, https://github.com/nodejs/llhttp, https://github.com/tatsuhiro-t/wslay,
https://github.com/Mbed-TLS/mbedtls, https://github.com/Mbed-TLS/TF-PSA-Crypto, https://github.com/cesanta/mongoose, https://github.com/civetweb/civetweb, https://github.com/curl/curl, https://github.com/wolfSSL/wolfssl,
https://sqlite.org/download.html, https://github.com/wasm3/wasm3, https://github.com/bytecodealliance/wasm-micro-runtime, https://github.com/libffi/libffi, https://github.com/mackron/miniaudio, https://github.com/lieff/minimp3,
https://github.com/lieff/minimp4, https://github.com/videolan/dav1d, https://github.com/cisco/openh264, https://github.com/nothings/stb, https://github.com/harfbuzz/harfbuzz, https://github.com/Tehreer/SheenBidi,
https://github.com/thorvg/thorvg, https://github.com/sammycage/lunasvg, https://github.com/memononen/nanosvg, https://github.com/blend2d/blend2d, https://github.com/libjpeg-turbo/libjpeg-turbo, https://github.com/webmproject/libwebp,
https://github.com/libsdl-org/SDL, https://github.com/glfw/glfw, https://github.com/Dav1dde/glad, https://github.com/floooh/sokol, https://github.com/jkuhlmann/cgltf, https://github.com/zeux/meshoptimizer,
https://github.com/mapbox/protozero, https://github.com/mapbox/vtzero, https://github.com/mapbox/earcut.hpp, https://github.com/AngusJohnson/Clipper2, https://github.com/maplibre/maplibre-native,
https://github.com/zherczeg/sljit, https://github.com/asmjit/asmjit, https://github.com/vnmakarov/mir, https://github.com/tc39/test262, https://github.com/WebAssembly/testsuite, https://github.com/web-platform-tests/wpt,
https://github.com/AFLplusplus/AFLplusplus, https://github.com/google/oss-fuzz, https://github.com/sparkle-project/Sparkle, https://github.com/AppImageCommunity/AppImageUpdate, https://github.com/tree-sitter/tree-sitter.
Local: `next/ARCHITECTURE.md`, `next/third_party/README.md`, `docs/reports/zinc-next-{design,decisions,perf,m4-benchmarks,mquickjs,packaging}.md`, `docs/reports/research-2026-09-30-all.md`, `docs/reports/research-2026-09-30/code-editor-lsp.md`.
