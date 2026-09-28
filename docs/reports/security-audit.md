# Security audit (2026-09)

Scope: the runtime (memory safety, reference counting, allocator, fixed pools), every parser of untrusted input, the
network services and their authentication, filesystem and process access, deployment (export, deploy.sh, systemd),
the compiler's generated C++, and the supply chain. Method: code review, then one fuzz harness per parser
(`tests/fuzz/`, libFuzzer + ASan + UBSan) run until clean, then a conformance regression per runtime fix
(`tests/conformance/hardening.ts`). The resulting guarantees and limits are in
[guide/08-security.md](../guide/08-security.md); third-party code in [security/third-party.md](../security/third-party.md).

Severity: **critical** remote memory corruption or a crash from one packet on a default listener; **high** memory
corruption from program or file input, remote code or file access, privilege escalation; **medium** denial of service,
missing authentication or hardening, injection needing unusual input; **low** defence in depth.

## Findings

| # | Severity | Component | Issue | Fix | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | critical | `zinc:net` serve (`runtime/mod/net.cpp`) | `Content-Length` parsed with `atol`: a negative or overflowing value passed the length check and copied ~4 GB out of bounds (one request crashes any `serve()` program); `atol` also read past the buffer | digits only, within the headers, at most `ZRT_HTTP_MAX_BODY` (1 MiB); 400 / 413 / 431 replies; corpus `http/content-length-*` | fixed |
| 2 | critical | `zinc:mqtt` (`runtime/mod/mqtt.cpp`) | PUBLISH topic length not checked against the packet: out-of-bounds read then a ~4 GB copy; remaining-length varint unbounded (wraps); CONNACK read `p[1]` of a 0-byte packet | 4-byte varint, fields checked against the packet, 1 MiB packet cap (`ZRT_MQTT_MAX_PACKET`); corpus `mqtt/*` | fixed |
| 3 | critical | remote display RLE (`plugins/display-remote/remote_proto.h`) | `rle_decode` with a rectangle width of 0 never wrapped to the next row: heap overflow in any zinc:remote viewer (ZincStudio included) fed by a malicious server or a spoofed beacon | empty rectangles take no data; `rle_check.cpp` asserts it; corpus `remote/rect-zero-width` | fixed |
| 4 | high | `gfx.path` / `polygon` (`runtime/gfx.cpp`) | contour counts are program data: a negative count was UB (`double` → `unsigned`), a huge one wrapped the index and overflowed the point pool, and the stored count claimed points that were never written (rasterizer read past them); an open polygon wrote one float past the pool | counts clamped to the points present, written count exact, pool check +1; `gfx::emit` validates plugin contours too | fixed (`hardening.ts`, `fuzz/gfx.cpp`) |
| 5 | high | rasterizer (`runtime/raster.cpp`) | a NaN y coordinate became a garbage row index: out-of-bounds write into the edge table; out-of-range float → int conversions (UB) everywhere a command coordinate is converted; image scaling with a tiny width gave a negative sample index (read before the image) | NaN edges skipped; saturating conversions for command coordinates; per-pixel paths clamp or validate the scale first (1e6 texels/pixel) | fixed |
| 6 | high | pools + weak references (`runtime/zrt.cpp`, `zrt_ext.h`) | a `@pooled` object that was `@weak`-referenced was freed with the system allocator (static pool storage): crash / heap corruption | pools register their slab; `mfree` returns such a slot to its pool | fixed (`hardening.ts`, ASan) |
| 7 | high | arenas (`runtime/zrt.cpp`) | an `Arena` disposed while a newer one was open stayed linked from it: use-after-free on every later allocation check | unlinked wherever it is in the chain | fixed (`hardening.ts`, ASan) |
| 8 | high | zinc:remote viewer (`plugins/remote-view`) | a HELLO size the runtime refused left the session's size set: the next RECT wrote past the image | the size is checked against the image actually allocated; protocol error otherwise | fixed |
| 9 | high | glTF / GLB (`plugins/three`) | GLB chunk length `off + 8 + clen` wrapped in 32 bits: infinite loop or a JSON chunk of ~4 GB (out-of-bounds read); out-of-range JSON number casts (UB) | length checked by subtraction; saturating casts of every JSON number | fixed (`fuzz/gltf.cpp`) |
| 10 | high | vector tiles (`plugins/map`) | a LineTo before any MoveTo incremented a coordinate as if it were the contour count (out-of-bounds read in tile rendering); protobuf sub-messages read uninitialised when the wire type differed; varint shift ≥ 64 (UB) | points before a MoveTo dropped; cursors reset per field; shift bounded | fixed (`fuzz/map.cpp`) |
| 11 | high | TrueType (`runtime/ttf.cpp`) | `ttfs[8]` overflowed with more than 5 custom fonts in `assets/` (a normal project); no read was bounds-checked; glyph ids ≥ 2^31 bypassed the glyph check; `numH = 0` / `upem = 0` | 32-entry table, guarded; every read through a bounds-checked reader; composite fan-out budget | fixed (`fuzz/ttf.cpp`) |
| 12 | high | `deploy.sh` (`compiler/src/tools.ts`) | staged in a predictable `/tmp/<name>` and copied with `sudo rsync -a`: the binary and unit stayed owned by the ssh user while the service ran as root (local root escalation, or a pre-planted `/tmp/<name>`) | `mktemp -d` staging, installed `root:root`, fixed modes | fixed |
| 13 | high | systemd unit (`zinc export --target linux/rpi1`) | ran as root with no sandboxing; network listeners bind all interfaces by default | `DynamicUser`, no capabilities, `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`, kernel/clock/cgroup protections, `StateDirectory` for storage, device groups filtered by `deploy.sh` | fixed |
| 14 | high | resource baking (`compiler/src/resources.ts`) | asset file names (fonts, images) pasted into C++ string literals unescaped: a file name with `"` and a newline injects code into the program | octal-escaped literals | fixed |
| 15 | high | `zinc:mapping` over OSC | `/save` and `/load` took any path from the network (arbitrary file write, e.g. a shell profile); `/sync` replied with up to 17 datagrams to any address (amplification) | plain file names only over OSC, `/sync` at most 10/s; `ZINC_BIND` to restrict the listener | fixed |
| 16 | high | mapping web companion (`examples/video/mapper/companion`) | listened on all interfaces with no authentication; any web page in the user's browser could POST OSC to it (CSRF), reaching #15 | `127.0.0.1` by default, per-run token in a custom header (also blocks CSRF) | fixed |
| 17 | medium | `zinc:net` serve | unbounded request buffer, no connection or idle limits, a busy loop on `EAGAIN` while sending (a client that does not read froze the event loop) | 16 KiB headers + body cap, 32 connections, 10 s idle, blocking send with a 2 s timeout | fixed |
| 18 | medium | DevTools (`plugins/devtools`) | no `Host` or `Origin` check: any web page could open `ws://127.0.0.1:9229` (screenshot, DOM edits), and DNS rebinding worked | 403 unless Host is loopback and Origin (when sent) is the DevTools frontend | fixed (corpus `cdp/*`) |
| 19 | medium | display-remote | no authentication when bound to the LAN; the newest connection replaced the viewer and injected input | optional token (`ZINC_REMOTE_TOKEN` / `token`), AUTH before HELLO, unauthenticated connections never replace the viewer, warning when exposed without one | fixed |
| 20 | medium | display-remote / remote-view | PING replies queued without limit for a client that does not read; `realloc` results unchecked; the viewer buffered any message length the server announced | PONG only while the queue is small, checked reallocs, message length bounded by the screen size | fixed |
| 21 | medium | SVG (`plugins/svg`) | nested `<g>` overflowed the stack; `stroke-dasharray` with infinite or tiny values looped forever while allocating; `<use>` fan-out was exponential; the float contour count saturated at 2^24 (then read wrong) | nesting 256, element budget 200000, point cap 2^22, numbers clamped to ±1e30, absurd dash arrays draw solid | fixed (`fuzz/svg.cpp`, corpus `svg/*`) |
| 22 | medium | Lottie (`plugins/lottie`) | precomps referencing themselves and nested repeaters expanded exponentially; out-of-range float → int casts (UB) | 100000 layers/copies per frame; saturating casts | fixed (`fuzz/lottie.cpp`) |
| 23 | medium | map styles (`plugins/map`) | JSON recursion unbounded (parse, free, filter evaluation); `strlen(NULL)` when `source-layer` or a `get` key is not a string | depth 64, type checks | fixed |
| 24 | medium | strings (`runtime/zrt.cpp`) | `s.lastIndexOf('')` never returned (found by fuzzing); `lastIndexOf` rescanned from each match (quadratic) | one backward scan | fixed (`hardening.ts`, `fuzz/strings.cpp`) |
| 25 | medium | runtime sizes (`zrt.h`, `zrt.cpp`) | on 32-bit targets `sizeof(T) * n` could wrap (small block, then overflow); TLSF rounded a huge request to a tiny block; `StrBuilder` looped forever past 2^31 bytes; runtime images `w * h * 4` wrapped | checked element sizes, `n > budget` in the allocator, strings capped at 2^30, images at 16384 per side | fixed |
| 26 | medium | generated C++ (`compiler/src/emit-cpp.ts`) | `#line` directives pasted file names unescaped: a file name with a quote or newline injected code into debug builds | JSON-escaped file names | fixed |
| 27 | medium | `zinc export` | the project name flowed unchecked into `rm -rf` of `dist/<name>-<target>`, shell commands run with sudo on the device, unit and `.desktop` lines | separators and control characters refused; a plain `[A-Za-z0-9._-]` word for linux/rpi1/rmpp | fixed |
| 28 | medium | `zinc:storage` (`runtime/mod/storage.cpp`) | file created world-readable (the guide recommends it for tokens), truncated before rewriting (a crash lost everything), values over 8 KiB split into bogus entries | written to a 0600 temp file, fsync, rename; lines of any length | fixed |
| 29 | medium | `zinc:process` | arguments travel joined by U+001F: an argument containing it became several (argument injection), a NUL cut it; the program's sockets and files leaked into children | such arguments throw; children get only stdin/out/err (`POSIX_SPAWN_CLOEXEC_DEFAULT` / `closefrom`) | fixed (`examples/process/cli`) |
| 30 | medium | wasm dev server (`compiler/bin/serve.mjs`) | listened on all interfaces; `GET /%E0` crashed it; the root prefix check let `<dir>-x/` siblings through | loopback (`HOST` to change), 400 on bad escapes, separator-terminated root | fixed |
| 31 | medium | supply chain (`docker/`) | SDK base images and ESP-IDF referenced by tag (`latest` for ps2) | pinned by digest | fixed |
| 32 | medium | build flags | release builds had no stack protector, FORTIFY or RELRO (depended on each toolchain's defaults) | `-fstack-protector-strong -D_FORTIFY_SOURCE=2`, `-z relro -z now` on Linux; measured below | fixed |
| 33 | medium | stb_image configuration (`plugins/three`) | internal asserts compiled out; no dimension limit: a few hundred bytes of JPEG declaring 16384 x 16384 pixels ran the decoder for minutes and asked for 1 GiB (found by fuzzing) | asserts abort, `STBI_MAX_DIMENSIONS 16384`, at most 2^24 pixels decoded (checked with `stbi_info` first); upstream advisories in third-party.md | mitigated |
| 34 | medium | JSON.parse on small targets | 512 nesting levels of recursion on a 16 KiB ESP32 stack | `ZRT_JSON_DEPTH` 32 on esp32 and ps1 | mitigated |
| 35 | low | `Dyn` / array indices | `(int32_t)` of an out-of-range or NaN `double` index before the range check (UB, UBSan) | range checked first | fixed |
| 36 | low | event loop | `(uint64_t)(wait * 1000)` for a huge timer delay (UB) | at most one second per sleep | fixed |
| 37 | low | `zinc monitor` | bound all interfaces, printed datagram strings raw (terminal escape injection), crashed on `{"type":"hello"}` | loopback (`ZINC_MONITOR_HOST`), control characters escaped, handler guarded | fixed |
| 38 | low | `zinc:webview` (macOS) | the IPC bridge trusted any port on localhost | only the port of the page the app opened | fixed |
| 39 | low | `zinc:fs` | a path containing NUL was cut by libc (`"x\0.txt"` passes an `endsWith('.txt')` check) | such paths fail | fixed |
| 40 | low | asset embedding | hidden directories (`assets/.git`, `.secrets`) were embedded | hidden files and directories skipped | fixed |
| 41 | low | ESP32 WiFi credentials | ssid and password pasted into CMake unescaped (`${…}` expanded, `;` split); password only in zinc.json | quoted CMake arguments; `ZINC_WIFI_PASSWORD` from the environment | mitigated |
| 42 | low | `zinc tsconfig` / editor plugin | `rm -rf node_modules/zinc-ts-plugin` even if it was a real package | only our own symlink is replaced | fixed |
| 43 | low | `zinc:video` | player size from the file's aspect ratio unbounded (UB cast, huge mallocs unchecked) | at most 8192 per side, allocations checked | fixed |
| 44 | low | sim OSC (`sim/osc.mjs`) | a truncated datagram threw in the simulator | decoded like the native one | fixed |
| 45 | low | input tapes (`ZINC_REPLAY`) | a replayed tape's touch, key and text counts indexed fixed arrays unchecked | clamped when read | fixed |
| 46 | low | deferred destruction (`runtime/zrt.cpp`) | when the 4096-slot deferred queue is full, a release cascade recurses again (stack) | bounded by the object graph's depth; documented | accepted |
| 47 | low | obfuscation docs | "every string literal" overclaimed; the keystream seed is public | guide corrected | fixed |
| 48 | low | remote-display beacons, OSC | UDP senders are unauthenticated and spoofable | documented (a listed app is not an authenticated one) | accepted |
| 49 | low | asset embedding | symlinks under `assets/` are followed (an asset can come from outside the project) | documented: the build machine is trusted | accepted |
| 50 | low | ZincStudio projects | a `.zproj` contains code that runs when the project runs | documented: open projects you trust | accepted |
| 51 | low | `zinc:process` | a single empty argument (`['']`) is dropped by the join | documented | accepted |
| 52 | low | ESP32 fetch (`runtime/mod/net_esp32.cpp`) | `malloc` results unchecked; two literal lengths include the NUL | reported to the web-APIs work (owns fetch) | open |
| 53 | low | host fetch (`runtime/mod/net.cpp`) | no `CURLOPT_TIMEOUT`, no response size cap | reported to the web-APIs work (owns fetch) | open |
| 54 | info | compiler | identifiers such as `INT32_MAX`, `__LINE__`, `NAN` fail to compile (macro collisions); not injection | – | open |
| 55 | info | runtime | `-fno-threadsafe-statics` while some plugins run worker threads (gphoto2, video): a function-local static first used on two threads would race | none observed; review when a plugin adds statics in thread code | open |

## Fuzzing

`scripts/fuzz.sh` builds each harness with libFuzzer + ASan + UBSan (UB is fatal) against the runtime (`ZRT_DEBUG`:
every allocation through malloc) and runs it with its seed corpus; `zinc test --fuzz` replays the corpora.

Machine under heavy load from other builds (load average 60 to 110), so executions per second are low; each harness
ran in several campaigns (10 to 60 s while fixing, then 180 s on the final code).

| Harness | Parser | Executions (final 180 s run) | Executions (all runs) | Found | Status |
| --- | --- | --- | --- | --- | --- |
| `json` | `JSON.parse` + stringify round trip | 8 092 079 | 13 402 921 | – | clean |
| `strings` | UTF-16 indexing, slicing, search, case, padding on arbitrary bytes | 1 548 522 | 2 984 006 | `lastIndexOf('')` hang (#24) | fixed |
| `http` | `net.serve` request parser, split across two reads | 1 110 426 | 5 591 476 | – | clean |
| `mqtt` | broker packets (CONNACK, PUBLISH, topic matching) | 8 312 836 | 12 129 988 | – | clean |
| `osc` | OSC datagrams | 18 147 510 | 33 429 686 | – | clean |
| `cdp` | DevTools HTTP (Host / Origin) and WebSocket frames | 1 993 050 | 3 404 805 | – | clean |
| `remote` | remote display stream (HELLO, RLE RECT, FRAME, PONG) | 1 387 236 | 1 874 346 | – | clean |
| `gfx` | every `zinc:gfx` draw call with hostile numbers, then rasterized | 49 956 | 71 639 | – | clean |
| `svg` | SVG parse, draw, rasterize | 2 292 | 4 265 | dash loop, `<use>` explosion, 2 GB allocation (#21) | fixed |
| `lottie` | Lottie parse, three frames drawn and rasterized | 100 875 | 242 346 | UB conversions (#22) | fixed |
| `gltf` | glTF / GLB and every loader query | 413 126 | 827 157 | UB conversions (#9) | fixed |
| `image` | PNG / JPEG (stb_image, as configured) | 452 466 | 476 018 | JPEG decompression bomb (#33) | fixed |
| `ttf` | TrueType parse and rasterization | 630 391 | 771 986 | – | clean |
| `map` | map styles and vector tiles, decoded, filled, stroked | 25 321 | 56 299 | – | clean |

About 75 million executions in all, no open crash. `svg` and `map` are slow per input (each one rasterizes a frame
or tile under ASan); longer campaigns would help them most. The HTTP client is libcurl's (fuzzed upstream) and
WebSocket exists only in the DevTools endpoint (`cdp`).

Found by fuzzing and fixed: #24 (`lastIndexOf('')` hang), #33 (JPEG decompression bomb), #21 (SVG dash loop and `<use>` explosion reproduced, the
point budget), #22 (Lottie UB casts), #9 (glTF UB casts). The seeds include the reproducers of the review findings
(`http/content-length-*`, `mqtt/*`, `remote/rect-zero-width`, `svg/nest-deep`, `svg/dash-inf`, `svg/use-fanout`,
`json/deep`, `image/huge-jpeg-timeout`).

## Hardening flags overhead

CPU time (user + sys), median, macOS arm64, this machine under load (other builds running), baseline commit vs this
branch without (`ZINC_HARDEN=0`) and with the flags:

| Benchmark | baseline | branch, no flags | branch, flags |
| --- | --- | --- | --- |
| raster micro-benchmark (400 frames of rrects, polygons, strokes, text, shadows, full render), 15 runs | 554 ms | 557 ms (+0.4 %) | 548 ms (within noise) |
| fannkuchredux (tight array permutations), 9 × 20 runs | 7.81 s | 7.83 s (+0.3 %) | 7.97 s (+1.8 % vs no flags) |
| binarytrees, fib, jsonout, mandelbrot, mapset, nbody, sort, spectralnorm, strings | – | ±0 % | 0 to +1.4 % (noise level) |

The runtime fixes themselves cost nothing measurable once the per-pixel paths clamp before converting (a first
version with saturating conversions everywhere cost 4 % on the raster benchmark). The flags are on for release builds
of hosted targets; `ZINC_HARDEN=0` turns them off.

## Tests

`node compiler/src/cli.ts test --target macos` for the profiles macos, ps1, esp32, rpi1 and rmpp, with `--debug`
(ASan + UBSan) and `--pixels`: see the results below; `tests/conformance/hardening.ts` is the runtime regression
program (each block crashed, hung or corrupted memory under ASan before its fix).

| Command (`--target macos`) | Result |
| --- | --- |
| `test` (profile macos) | 34 programs, 0 failures |
| `test --profile ps1` | 34 programs, 0 failures |
| `test --profile esp32` | 34 programs, 0 failures |
| `test --profile rpi1` | 34 programs, 0 failures |
| `test --profile rmpp` | 34 programs, 0 failures |
| `test --debug` (ASan + UBSan) | 34 programs, 0 failures |
| `test --pixels` | 6 frames, 0 failures |
| `test --fuzz` (corpora replay) | 14 harnesses, 0 failures |

Also checked: a Linux build in `zinc/sdk-linux` (PIE, `BIND_NOW`, `GNU_RELRO`), `examples/process/cli` (all checks,
including the new separator check), the mapping companion (401 without the token, 204 with it), the webview, video and
mapper examples (build), `plugins/display-remote/rle_check.cpp`, `tsc -p compiler`.
