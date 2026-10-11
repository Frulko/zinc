# Later: what is not a task yet

The backlog is frozen (AGENTS.md, "Keep the backlog shrinking and the sessions cheap", owner, 2026-10-11): an idea, an improvement, hardening, a measure
to take or a check on another target is one line here, not a task. `- ZN-n: what, and why it matters` (ZN-n is the task that found it).
The next backlog review turns lines into tasks or deletes them.

## Engine and tools

- ZN-569: a Worker in the web environment, and `createImageBitmap` with it; PixiJS `Assets.load` takes that path when both exist.
- ZN-569: images read and decoded off the frame in the host; a large image stalls the frame that loads it.
- ZN-565: one whole run of `tests/t1/webgl_conformance.sh` on a quiet machine; the last one timed out on one page under a load of 85 (695 of 787).
- ZN-373.04: a zinc:socket WebSocket client that calls ws.close() against `zinc debug --cdp` stays alive (a probe hit its 30 s timeout); the inspector quits explicitly, other clients would hang.
- ZN-373.05: Tracing against `zinc debug --cdp`: no frames there, the inspector's Performance view stays at "recording" for a debugger target.
- ZN-430: a .zapp's members are still unpacked once into the cache (its size again on disk); reading assets in place from the archive needs zinc:assets and the readers by path (video, sqlite, zinc:fs) on an archive source, the ZPK design of docs/reports/games/toolchain-assets-loading.md 6.1.
- ZN-155: `zinc ui` runs the prototype's Node tools (compiler/src/ui-tools.ts, ui-document.ts, ui-package.ts, about 400 lines); a C++ port would make it work in an installation without the checkout and Node.
- ZN-155: `p.then(x => promise)` does not flatten the promise it returns, so `fetch(u).then(r => r.text())` yields a Promise (async/await is right): the checker's __then helpers need a Promise-returning variant. The parity gate's most visible PARTIAL.
- ZN-155: console.log(-0) prints -0 (the prototype printed 0); an i64 near 2^53 rounds otherwise than the prototype; tests/conformance/scroll_physics.tsx prints nothing (its frozen output starts "dragged 150").
- ZN-155: default values in array patterns (`const [a = 1] = xs`) are still refused (object patterns take them).
- ZN-583.01: zinc:physics2d steps on one thread; Box2D's task callbacks would spread a step over workers (drop.out must stay identical with 1 and 4 workers).
- ZN-583.01: zinc:physics2d has no shape casts, overlap queries, distance/weld/wheel joints or queries of contacts in progress yet; add them when a program needs them.
- ZN-583.01: remeasure next/bench/physics2d_pile.ts on a quiet machine (the 1.79 / 2.61 ms of the perf log were taken at load 3.8).
- ZN-433: ZN-436's asset workers each own a zstd decoder context and pass it to the ZPK reader (dictionary entries 9.8 -> 6.9 ms in ZN-433's measure; a per-thread context in the reader would be a global).
- ZN-433: the first read of a ZPK entry hashes at 169 MB/s (third_party/sha256); use mbedTLS's or a SHA-extension SHA-256 when large packs are verified at launch.
- ZN-433: link zinc with -dead_strip / --gc-sections: lz4.c drops from 70 KB to 2.7 KB and the zstd decoder from 137 KB to 117 KB (D40).
- ZN-433: measure zstd's decoder size macros (HUF_FORCE_DECOMPRESS_X1, ZSTD_FORCE_DECOMPRESS_SEQUENCES_SHORT, ZSTD_NO_INLINE) on the consoles and the Pi 1.
- ZN-354: plugin.yml rebuilds zinc in every leg and in the release job (5 to 10 min each): use a release package when zinc-ref is a tag, or cache the build by commit.
- ZN-354: the path filters of zinc-next.yml miss templates/** and .github/workflows/plugin.yml, so a change there runs no CI test.
- ZN-354: `zinc test` in a project also runs the tests its plugins/ carry (a plugin added from the starter brings tests/): skip plugins/ as build/ is skipped?
- ZN-274: ease the opaque hover:/focus:/active: text and border colours at paint time, like the background.
- ZN-274: CSS's reversing shortening: a transition sent back mid-way should take the shorter time.
- ZN-274: transition keys in style objects (Reanimated 4's CSS transitions) and arbitrary values such as duration-[2s].
- ZN-274: bench-render before and after the applyProp guard of transitions, on a quiet machine.
- ZN-327: zinc:fs watch of a file reports its changes without fs:read under "permissions" (the other unchecked calls were fixed).
- ZN-327: `zinc export --target linux` builds aarch64-linux; add an x86_64-linux target (zinc publish labels the aarch64 build Linux (ARM64), channel linux-arm64).
- ZN-327: `zinc monitor --udp` binds every interface and prints control characters raw: bind 127.0.0.1 by default and escape them, as the prototype did.
- ZN-327: release builds have none of the prototype's hardening (stack protector, FORTIFY, RELRO); decide, measured with tools/bench-m4.
- ZN-327: docs/guide/06-testing.md still says --debug builds with ASan and a leak report (in Next an lldb build; leaks: zinc mem --check-leaks).

## Demos

- ZN-649.14: a rule of a pinball table can listen to the plunger, so a skill shot needs no hidden sensor.

## Cross-platform pass

- ZN-576: tests/golden/webgl/antialias.js expects a multisampled canvas; on a GLES 2 context (Pi 3) antialias is reported false, so the golden needs a GLES 2 variant there.
- ZN-321: `zinc export --target linux --deb --key <seed>` then `zinc verify` on the .deb and on a changed copy (the .deb is signed by the export's artifact list; never run, a .deb needs the Linux cross build).
- ZN-583.01: zinc:physics2d on Linux (tests/t1/physics2d.sh in the container, drop.out byte for byte) and on arm64 macOS, rpi, wasm and the handhelds (NEON instead of SSE2), drop.out identical.
- ZN-433: zpk_test and fuzz_zpk on Linux x86_64 and arm64, and a zig cross build of zn_zstd and zn_lz4.
- ZN-354: tests/t2/cross_plugin_pack.sh and the linux-armhf leg of plugin.yml (which runs no tests: run them under qemu-arm or on a Pi).
- ZN-274: the 8-tween budget of transitions on a real ESP32.
- ZN-327: the guide's flow for --target linux and rpi (export, --deb, the itch channels).
