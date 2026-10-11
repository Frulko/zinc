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
- ZN-434: asset importers in parallel (ZINC_ASSET_JOBS) when a first build of many images measurably waits on one core.
- ZN-434: a stat index of the asset sources (size, mtime) when reading and hashing every source shows in second builds (100 MB: 117 ms today).
- ZN-434: importer versions instead of the engine's executable stamp in the asset keys once the importers settle, so CI shares ~/.zinc/cache/assets across engine builds and `zinc assets verify` can compare.
- ZN-434: key the font baker on its scan's result (sizes, characters, faces) instead of the source texts, so an edit that adds no size or character reuses the blob in `zinc dev`.
- ZN-434: zpk::write taking entries already compressed, so a release pack with one changed entry recompresses that entry only.
- ZN-581: the browser host (targets/wasm/glue/worker.mjs) ignores drawImageRect's new rotation, tint and blend arguments.
- ZN-581: a turned sprite takes 15 floats of the point pool (about 17,000 per frame on desktops before it fills): let the pool grow like the command buffer.
- ZN-581: 20,000 Retina sprites cost about 10 ms of GPU on the 555X: measure a sprite-only shader program, or opaque sprites in the occlusion pass.
- ZN-581: zinc:canvas could map globalCompositeOperation lighter, multiply and screen onto the new blend modes.
- ZN-435: zinc.json assets.dir is honoured only by zinc assets build/info; the baker (bakeResources), zinc export's copy of assets/ and zinc:assets still use assets/ beside the entry.
- ZN-435: wire the effective asset profile's pack codec into release packs (lz4 on rpi1/esp32/ps1/ps2, none on wasm) with ZN-436/ZN-439.
- ZN-435: the prototype's zinc:platform now also exports ASSETS = false from capabilities.json's new assets group (as for UI); compiler/src/capabilities.ts could skip object groups.
- ZN-436: make asset handles engine resources (native ABI R<k>) so a dropped handle releases itself.
- ZN-436: zinc export should ship the packs beside the program; its zinc build child rebuilds dev packs over the release ones export just built, and a cross child names them by the zig target (build/assets/aarch64-linux).
- ZN-436: zn_asset_font (gfx loadFont) and webview zinc:// URLs still read only the assets directory; read them through the packs.
- ZN-436: the browser host, the device core and the ESP32 (esp_partition_mmap) serve no zinc:assets v2 rows yet.
- ZN-436: a 2 ms time slice on one-core targets if the 4 MB byte slice of asset turns measures too coarse there.
- ZN-261: Tailwind v4 interpolates bg-linear/radial/conic in oklab; zinc:ui interpolates in sRGB (subdivide the stops in oklab where a profile allows).
- ZN-261: gradients in state variants (hover:from-*, hover:bg-linear-*) are refused; per-corner radii (rounded-tl-*) are not followed under a gradient (it takes the box radius).
- ZN-261: canvas2d createConicGradient through paint kind 4 (the raster and the GL shader have it).
- ZN-261: on GL, a box drawn through setTransform with a gradient of more than 8 stops keeps its first 8.
- ZN-262: the GL replay keeps rounded CLIPs above CORNER = 32 device px square, so object-cover rounded-full images (and overflow-hidden rounded-full avatars) wider than 32 px at scale 2 lose their round corners on the GL renderer; an SDF clip in the shader would lift it.
- ZN-262: zinc:react-native has no ImageBackground and Image takes no source={{ uri }}; a View with backgroundImage: 'url(..)' covers the first.
- ZN-262: background images follow the box's one radius, not per-corner radii, and take the border box as their area (no background-origin / -clip).
- ZN-438: `zinc export` (native targets) should copy `build/assets/<target>` into dist; exported games use the loose-image fallback today.
- ZN-438: the res baker should skip images a sprite rule takes; game-2d's SVGs are baked twice.
- ZN-438: atlas page format, `maxSize` and POT should come from the target's asset profile (rgb565/rgba4444 with ZN-439's encoders).
- ZN-438: zinc:assets v2 image handles should free pack images with their group; they live for the program's lifetime today.
- ZN-438: the browser export should use the atlas (with ZN-449); check TexturePacker rotated frames on a sheet TexturePacker wrote (the test sheet follows its documentation, clockwise).

## Demos

- ZN-649.14: a rule of a pinball table can listen to the plunger, so a skill shot needs no hidden sensor.
- ZN-650.10: the museum editor offers `accessibility.descriptions` and plays a description.
- ZN-650.10: at the two larger text sizes the button rows lie over the lowest cards; lay the table out above them.
- ZN-650.10: zinc:audio decodes nothing in a deterministic run, so a test cannot read a sound log there.
- ZN-650.08: zinc:video has no sound; a film with a sound track needs audio played in step.
- ZN-650.08: film decoders are never closed (16 at most).
- ZN-650.08: zinc:assets gives no path, so a film is copied to the temp directory at first play.
- ZN-650.08: the museum editor does not play a film or offer poster, loop and subtitles.
- ZN-650.08: museum_visit (62 s) and museum_editor (123 s) still last over a minute.
- ZN-650.12: the staff summary shows today only (week, month); a packaged table needs a default statistics directory; a visit under way at switch-off is not counted.
- ZN-650.13: storyboard miniatures ignore item rotation, and `table.visitors` is read and unused.
- ZN-650.13: the attract loop loads the model and the panorama a second time; share mesh and texture.
- ZN-650.13: a scripted drag on the panorama from a short side.
- ZN-649.14: narrow a rule's `event` by its `on` (and multiball's `jackpotOn`/`jackpotEvent`); it changes every session that chooses an event.
- ZN-649.14: a deletion could hand the rules to another thing of the same kind; a list `do` on a mission; lights or elements chosen by a click on the top view; a renamed counter is not renamed in the rules that use it; the scores grid needs a horizontal scroll under 1440 wide.
- ZN-649.17: the pinball does not start with `--engine quickjs` ("Could not find export 'TableDef'", an interface imported by name).
- ZN-649.17: a table or package dropped on the window could join the list (zinc:system `drop`); free the scene and sounds of the table that leaves.
- ZN-649.18: a clip to a path in zinc:gfx (raster and GL), after which `drawInside` in topview.tsx goes; a visible handle for the field of view.

## Cross-platform pass

- ZN-576: tests/golden/webgl/antialias.js expects a multisampled canvas; on a GLES 2 context (Pi 3) antialias is reported false, so the golden needs a GLES 2 variant there.
- ZN-321: `zinc export --target linux --deb --key <seed>` then `zinc verify` on the .deb and on a changed copy (the .deb is signed by the export's artifact list; never run, a .deb needs the Linux cross build).
- ZN-583.01: zinc:physics2d on Linux (tests/t1/physics2d.sh in the container, drop.out byte for byte) and on arm64 macOS, rpi, wasm and the handhelds (NEON instead of SSE2), drop.out identical.
- ZN-433: zpk_test and fuzz_zpk on Linux x86_64 and arm64, and a zig cross build of zn_zstd and zn_lz4.
- ZN-354: tests/t2/cross_plugin_pack.sh and the linux-armhf leg of plugin.yml (which runs no tests: run them under qemu-arm or on a Pi).
- ZN-274: the 8-tween budget of transitions on a real ESP32.
- ZN-327: the guide's flow for --target linux and rpi (export, --deb, the itch channels).
- ZN-434: tests/t0/assets.sh on Linux x86_64 and arm64, and zn_assets (xxhash.h) under the zig cross builds.
- ZN-581: the sprite path on a Pi 3 (GLES 2) and on Linux GL, frames against the software ones.
- ZN-435: check the asset defaults of targets/capabilities.json on the devices (the rmpp, ps1 and ps2 values are estimates; the Pi and ESP32 budgets).
- owner, 2026-10-11: Windows opens the pass; list its tasks at the review (host and window of ZN-054, dialogs, installers, a CI runner or a machine).
- ZN-436: tests/t0/assets_groups.sh on Linux x86_64/arm64 and the Pi 1 (the in-turn decode path); a cross build that links the pack libraries and sets ZINC_PACK_TARGET.
- ZN-261: tests/t1/style_gradient.sh's GL comparison on llvmpipe (Linux) and on VideoCore IV GLES2 (Pi 3).
- ZN-261: rebuild the esp32 prebuilt core so its host table carries host.gfxGradientPaint (T0 programs never call it).
- ZN-438: sprite atlas sources build warning-free under `zig c++` (cross builds).
