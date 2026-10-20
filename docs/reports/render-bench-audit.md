# Rendering bench audit (2026-10-18, read-only)

Goal: a precise, reliable, readable record of CPU and GPU rendering performance and rendering problems, per backend and per device. This lists what exists, what is partial, what is missing, with citations (paths relative to the repo root).

## 1. Exists

### 1.1 Measuring in the runtime (env switches)

| Switch | What it records | Where | Backends / targets | Output |
|---|---|---|---|---|
| `ZINC_PROFILE=1` (also `ZINC_RENDER_STATS=1`) | Per frame, phases `APP, INPUT, ANIM, LAYOUT, PAINT, EFFECTS, DIFF, RASTER, PRESENT`; p50/p99/max over the last 4096 frames, plus a synthetic `work` (all phases but present) | `runtime/gfx.cpp:368-375` (phases, ring), `:405-431` (`stat_line`, `summary`), `:462-476` (env read), `:481-497` (`end`: RASTER = span of band timings the HAL reports via `zrt_prof_band`, PRESENT = rest of the call) | Every HAL that calls `zrt_prof_band` (macOS SDL `targets/macos/hal_sdl.cpp:1058-1113`, Vita `targets/vita/hal_vita.cpp:364`); Pi, Android, webOS, iOS use it through env (`src/app/shell_sdl.cpp:158`, `plugins/display-gl/src/webos.cpp:166`) | stderr text lines `zinc profile: <phase> p50=.. p99=.. max=.. ms` (logcat on Android) |
| `ZINC_TRACE=file.json` | Chrome-trace spans of the same phases, one thread per raster band | `runtime/gfx.cpp:433-460` (`trace_json`, 32768 spans `:371`) | same as above | Chrome trace JSON, written at exit (a program the OS kills never writes it, see `plugins/display-gl/src/display_gl.cpp:219`) |
| `ZINC_PERF_HUD=1` / `zinc.json dev.perfHud` / Cmd+Shift+P | On-screen panel with the profiler's numbers and a 120-frame graph; engine name from `include/zn/hostsys.h:10` | `runtime/gfx.cpp:511-575`, `src/main.cpp:1624,1927` | everywhere the runtime paints (rasterised into the program's frame) | pixels only; not machine readable |
| `ZINC_PRESENT_STATS=1` | Present broken into raster / upload / draw / swap / move / interval; p50/p99 over each 120 drawn frames | `targets/macos/hal_sdl.cpp:1126-1175` | macOS, Android, iOS SDL HAL (window path); `ZINC_GL_FINISH=1` adds `glFinish` per GL step so each step's time is its own (`:1519-1524`) | stderr line `zinc present: raster p50 .. p99 ..` |
| `ZINC_GL_STATS=1` | GL replay: frames, idle, draw calls and quads per frame, CPU us to submit, culling, programs built, glyph uploads, and **GPU us from GL_TIME_ELAPSED** (ring of 4 queries read 4 frames later, no stall) | `runtime/gl_replay.cpp:106-120` (query, `#if defined(__APPLE__) && GLR_CORE` only), `:1960-1975` (report), `plugins/display-gl/src/display_gl.cpp:51,140,234` (first-frame breakdown) | macOS GL 4.1 core only for GPU time; CPU-side counters on every GL path | stderr at exit |
| `ZINC_GL_TIME=1` | `glFinish` after replay and after the present pass: replay us, present pass us, swap us, GPU timer query (Apple only) | `plugins/display-gl/src/display_gl.cpp:214-232,265,305-373` | display-gl plugin (webOS, Pi, Linux, macOS) | stderr every 120 frames |
| `ZINC_GL_TRACE=1`, `ZINC_GL_ONLY=<mode>`, `ZINC_GL_LEAN`, `ZINC_GL_CORNERS`, `ZINC_GL_MOVE`, `ZINC_GL_VERIFY`, `ZINC_GL_INFO` | Diagnostic toggles and per-pass GL logs | `runtime/gl_replay.cpp:128-134,1860`, `targets/macos/hal_sdl.cpp:1527-1545`, `docs/targets/adapting-to-hardware.md:87-115` | GL paths | stderr |
| `ZINC_RENDER_STATS` counters | Last frame command counts by kind, scene bytes | `runtime/gfx.cpp:954-968` | all | stderr `zinc stats: ...` |
| `ZINC_VISUALIZE=damage\|cmds` | Overlay: damage flashes, command heat map | `runtime/gfx.cpp:306-330`, `docs/dev-mode.md` | all | pixels only |
| `ZINC_FRAMEHASH=all\|last` | FNV-1a 64 of every presented frame (or the last) | `runtime/gfx.cpp:935-950,984`, test `tests/t1/framehash.sh` | any display driver (hash of the software frame) | `zinc: framehash <n> <WxH> <hash>` on stderr |
| `ZINC_SHOT`, `ZINC_SHOT_FRAMES`, `ZINC_SHOT_EVERY`, `ZINC_SCALE` | Frame as PNG | `runtime/gfx.cpp:972-` (`after_present`), `plugins/display-gl/src/display_gl.cpp:142` | all; display drivers keep their own device-picture shot | PNG/BMP |
| `ZINC_SCENE_DUMP=path` | The frame's command list + pools (scene v1, 48-byte `Cmd`) | `runtime/gfx.cpp:879-,991`, `include/zn/scene.h` | all backends (it is the input of every backend) | binary `.scn` |
| `ZINC_INPUT=file`, `ZINC_FRAMES=n`, `ZINC_DETERMINISTIC=1`, `ZINC_HEADLESS=1`, `ZINC_DEMO` (hero) | Scripted input (`<frame> touch 0 X Y`), fixed frame count, repeatable sessions; works on a real window too | `src/host/hal_dispatch.cpp:51,108,305`, `src/main.cpp:189-254`, `docs/targets/adapting-to-hardware.md:106-115`, `examples/hero/src/main.tsx:86` | all | n/a |

### 1.2 Tools (`tools/`)

| Tool | What it records | Backends / device | Output |
|---|---|---|---|
| `bench-render` (`tools/bench-render:1-62`) + `bench/render/b1-quads, b2-rounded, b3-text, b5-poly, b8-layers, b10-matrix.ts` + `examples/hero` (B4) + maps navigation (B5 map) | Dumps a scene headless, replays it N times (`zinc capture --scene S --bench N T`, `src/host/render_bench.cpp`) on 1 and 4 band threads; median_us, p99_us, pixel hash; `--check-regressions` fails at >15% + 400 us or a hash change | **Software raster only, Mac host only** (no device path) | CSV `bench/render.csv` (`case,threads,width,height,cmds,median_us,p99_us,hash`) |
| `bench-layout` (`tools/bench-layout:1-12`, `tests/bench/layout_bench.cpp`) | Yoga vs classic layout, size of Yoga objects per target | host CPU | `bench/layout.json`, regression gate 15% |
| `bench-gate`, `bench-m1`, `bench-m4` (`tools/bench-gate:1-9`) | CPU kernels (fib, nbody, sort, strings), not rendering | host | JSON `bench/m4.json` |
| `resmon` + `zn_resmon.py` (`tools/resmon:1-27`) | CPU time, peak RSS, energy of any command (wall clock, not frames) | host (macOS/Linux) | JSON + one-line summary |
| `resource-probe` / `museum-probe` (`tools/museum-probe`, `tools/resource-probe`, `tools/scenarios/museum.json`) | Drives a route over CDP and logs the engine's live resource counters (`resourceStats()`, `src/frontend/modules.cpp:860`); lifecycle, not frame time | host with inspector | JSON |
| `device` (`tools/device:12-20,210-227`) | `profile <name> --frames N` runs a program on a Pi over ssh with `ZINC_PROFILE=1` and greps `zinc profile|fbdev|display-gl`; `stacks` samples with gdb; `shot` | Linux boards over ssh | text |
| `bench-bridge` (`tools/bench-bridge:1-318`) | zinc:script boundary cost; **device plumbing for mac, android (adb + Gradle + logcat), webOS (novacom), iOS (pymobiledevice3 + os_log)**; `profile` mode (sample / simpleperf / strace); `show` renders a table across files | Mac, Nexus 7, TouchPad, iPad | JSON per machine `docs/reports/bench/script-bridge-<label>.json` (`tools/bench-bridge:56-61`); sample artifacts in `docs/reports/bench/` |
| `glcompare` (`tools/glcompare:1-5`) | GL frame vs software frame whose size differs by an integer factor (box-average), fraction over N, MAE, max | any | text, exit 0 |
| `pixel-compare` (`tools/pixel-compare:1-17`) | Per-class diff using the scene dump: edge / text / interior; max_abs, p99_abs, share_gt8; per-golden JSON tolerance; diff PNG | any | text + PNG, exit 1 |
| `pngdiff` (`tools/pngdiff:1-3`) | tol, max-diff, bbox, **SSIM, PSNR, MAE**, crop, report PNG | any | text, exit code |
| `proto-capture` (`tools/proto-capture:1-14`) | Compares this engine with the prototype's pixel goldens (`tests/golden/examples/proto/`, 64 manifest rows `manifest.json`, per-entry `tol`, `max_diff`, `known` rows that may not grow, `skip`); `--canary` (4 entries) or `--all` | host | text, exit 1 |
| `style-neutrality` (`tools/style-neutrality:1-10`) | Fails when the golden manifest is loosened or a pixel moves | host | exit 1 |
| `diff-matrix` (`tools/diff-matrix:1-8`) | interpreter vs AOT vs frozen **program output** (text), not pixels | host | one line per program |
| `webgl-conformance` (`tools/webgl-conformance:1-15`) | Khronos pages on QuickJS; pass list `tests/golden/webgl/conformance-pass.txt`; **known failures per GPU family** (`conformance-known-<family>.txt`, apple, amd, intel) | host GPU | pass/fail/KNOWN lines |
| `three-compare` (`tools/three-compare:1-9`) | three.js scenes (128x128) on zinc WebGL2 vs headless Chrome; SSIM >= 0.90, MAE <= 12 (edges 0.95); refs in `tests/three/ref/` | host GPU | text |
| `layout-fuzz`, `layout-fixtures` | Layout correctness vs reference, not rendering | host | text |
| `tests/t1/gl_renderer.sh:1-20` | GL replay vs software frame on tests/visual + hero + navigation + lottie/svg galleries: <=5% pixels more than 24 off, MAE < 3 (shapes 12% / 15); skips (exit 77) on CI virtual GPUs | host GPU | pass/fail |
| other T1: `gl_replay_es2.sh`, `gl_scroll.sh`, `window_renderer.sh`, `pixel_compare.sh`, `pixel_scale.sh`, `webgl_*.sh`, `scroll_move.sh` (t0) | Feature goldens per GL feature | host | pass/fail |
| `bench-gate` / regressions policy | 15% threshold (RULES 7) in bench-render and bench-layout | host | exit 3 |

### 1.3 Device facts that exist (the plumbing to reuse)

- Mac: `tools/bench-bridge mac`, headless (`tools/bench-bridge:65`).
- Nexus 7: `zinc export --target android`, Gradle, adb, results from logcat; render env passes via `am start --es zinc.env "ZINC_PERF_HUD=1 ZINC_PROFILE=1"` (`src/app/shell_sdl.cpp:158-177`; release builds only keep `ZINC_PRESENT_STATS` / `ZINC_GL_STATS` from `zinc.env` in the app's external files).
- Frame pacing without the engine: `dumpsys SurfaceFlinger --latency` (`docs/reports/zinc-next-android.md:289-300`).
- TouchPad: env through `/tmp/zinc/env` (`plugins/display-gl/src/webos.cpp:166`); `zinc-helper` sets the governor (`docs/reports/hardware/hp-touchpad-webos.md:356-368`).
- iOS: pymobiledevice3 + os_log (`tools/bench-bridge:136-175`; `docs/reports/zinc-next-ios.md:69`).
- Pi: `tools/device pi@host profile` (`tools/device:210-227`).

### 1.4 Scenes that exist

- `bench/render/b1,b2,b3,b5,b8,b10` (synthetic, 1000x640 growDrawCommands, seeded RNG `bench/render/b1-quads.ts:2-3`), scene-dump deterministic.
- Deterministic UI/app corpus: `tests/visual/{clock.ts,overlays.tsx,shapes.ts,ui.tsx}`, `examples/hero` (`ZINC_DEMO=home|gallery|detail|playground|tasks|settings|palette|dialog|dark|bench` scripted tour), `examples/maps/navigation` (`ZINC_DEMO=navdrive` per `docs/reports/zinc-next-perf.md:764-775`), lottie/svg galleries, breakout (framehash test), `examples/boards/*/*/framehash.golden`, rn-showcase (scripted flings via `ZINC_INPUT`, `docs/reports/zinc-next-perf.md:792-808`), 64 proto goldens, `examples/{gl-cube,webgl-cube,webgl-studio,three,js-three,marble,museum-table,pinball,pinball3d,platformer,video,3d,canvas,bouncing-ball}`. Frame hash available for any of them via `ZINC_FRAMEHASH`.

## 2. Backends and where timing hooks sit

| Backend | Code | What "present" includes | GPU timing today |
|---|---|---|---|
| Software raster, bands/threads | `runtime/raster.cpp`, `targets/macos/hal_sdl.cpp:1058-1113` (`run_band`, `zrt_prof_band`) | RASTER phase = union span of the bands (when the HAL reports it); PRESENT = rest of `present()` incl. upload, swap, vsync wait (`runtime/gfx.cpp:481-497`) | n/a |
| GL replay (own GPU layer, D119) | `runtime/gl_replay.cpp` (GLES2 + GL core builds), `plugins/display-gl/src/display_gl.cpp`, `targets/macos/hal_sdl.cpp:1500-1600`, design `docs/reports/gpu-renderer-design.md:142-168` | The whole replay happens inside present, so `ZINC_PROFILE`'s PRESENT = replay CPU submit + swap + vsync wait; RASTER is empty. Nexus 7: "present p50 89 ms (whole frame replayed)" (`docs/reports/zinc-next-perf.md:786`) | Only `GL_TIME_ELAPSED` on **Apple core GL** (`runtime/gl_replay.cpp:106` `#if __APPLE__ && GLR_CORE`; `display_gl.cpp:216-231` `#ifdef __APPLE__`). Elsewhere GPU time is inferred from `glFinish` (serialises: "33.6 ms with glFinish, 11.6 CPU", `docs/reports/zinc-next-perf.md:709`) |
| Window HAL SDL3 (macOS/Android/iOS) | `targets/macos/hal_sdl.cpp` | Step split exists only with `ZINC_PRESENT_STATS` (`:1126-1175`); `swap` p50 is the wait for display when nothing drew (`:1166`, frames with total < 50 us skipped) | none |
| Metal on iOS | `targets/macos/hal_metal.mm` (71 lines): **software raster blitted by one MTLCommandBuffer into the CAMetalLayer drawable**; there is no Metal renderer of command lists (`docs/reports/zinc-next-ios.md:125-165`, `backlog/later.md:330`) | blit + `commit` (`hal_metal.mm:62`); `waitUntilCompleted` on the previous buffer (`:35`) | **None.** No `GPUStartTime/GPUEndTime`, no `addCompletedHandler`, no `MTLCounterSampleBuffer`, no `CADisplayLink`/presented-time (grep over `targets plugins src runtime` finds only `hal_sdl.cpp` and `hal_metal.mm`, neither uses them) |
| Vulkan | no code, no design doc (grep -ril: only the research mentions it as an option: `docs/reports/ui-rendering-architecture.md:167,189,193`, sokol/Skia/Impeller notes) | n/a | n/a |
| Metal command-list backend | design only: `docs/reports/gpu-renderer-design.md:142,168`; plan in the ZN-627 notes; `docs/reports/ui-rendering-architecture.md:638-639` (R7.1/R7.2); `later.md:330` | n/a | planned in `docs/reports/ui-rendering-architecture.md:535`: `gpu_us` from "EXT_disjoint_timer_query / Metal counters" (a design list, not code) |
| WebGL (zinc:gl on QuickJS) | `docs/reports/zinc-next-perf.md:181-190` PERF-12; tests `tests/t1/webgl_*.sh` | n/a | none |
| Console (Vita GXM, PSP, 3DS, PS1/2) | `targets/vita/gxm_vita.cpp:488` reports band span; profile p50 in `docs/reports/zinc-next-perf.md:840-858` | | none |
| Other display drivers (fbdev, KMS, webOS, ws2812, rmpp) | `plugins/display-*` | Pi flip: `fps, present p50/p99, convert p50, vsync p50` (`docs/reports/zinc-next-perf.md:766-772`) from `ZINC_PROFILE` + driver stats | none |

Vsync vs CPU: not separated in `ZINC_PROFILE` (PRESENT swallows the vsync wait). `ZINC_PRESENT_STATS` has a separate `swap` and `interval` column (`hal_sdl.cpp:1127-1129`), but only on the SDL HAL. Driver-specific fb drivers print their own `vsync` column.

## 3. What previous sessions recorded on hardware

Numbers by kind (all in `docs/reports/zinc-next-perf.md` unless noted):

- fps + present p50/p99 per path (software vs GLES 2): Nexus 7 `:776-791` (rn-showcase 60 fps rest, work p50 1.38 / p99 4.3, present p50 15.0 / p99 17-20; GLES 2 13.7 fps then 60 fps at rest, tab switch p99 17.4 ms, first switch 147 ms).
- Step split of present (`ZINC_PRESENT_STATS`), flings via `ZINC_INPUT`, "late frames of 720" counts and interval p99: Nexus 7 `:792-821`; iOS simulator `:822-835`.
- Interval p50/p99 on SurfaceFlinger, vsync drops: `docs/reports/zinc-next-android.md:289-300`.
- Pi 3B+: present p50 per screen, draw calls per frame, CPU % per frame with temperature, GPU ms from `ZINC_GL_TIME` (`:697-712`); fps, present, convert, vsync, CPU a frame (`:764-775`); film on the Pi (`:722-736`).
- TouchPad: software 25-45 fps, "16 ms draw + 19-25 ms SDL show" (`docs/reports/hardware/hp-touchpad-webos.md:179-182`); GPU draw call cost 0.2-0.9 ms CPU, glClear 0.6 ms (`:277-279`); frames a second over a scripted session table (`:283-`, method `docs/targets/adapting-to-hardware.md`).
- Mac GL fill rate: Radeon Pro 555X (`:421-440`, `:504-517`).
- Console p50: PS Vita and emulators (`:840-858`).
- CPU %, peak RSS, energy: `tools/resmon` (`tools/resmon`), Pi `ps` CPU (`:764-775`).
- Per-machine JSON artifact (script bridge only): `docs/reports/bench/script-bridge-*.json`.

Pitfalls recorded:

1. Any Magisk `su` during a run makes every other present about 105 ms for the following 18 s; no root command during a measurement (`docs/reports/zinc-next-android.md:180-182`; `zinc-next-perf.md:788`).
2. CPU governor/hotplug: TouchPad `ondemandtcl` sits at 192 MHz, a burst stalls hundreds of ms, a touch lifts to 1.188 GHz for 3 s (`docs/reports/hardware/hp-touchpad-webos.md:356-362`); Nexus 7 cpuquiet governors and PM QoS cores; any app launch boosts all four cores about 1.5 s (`docs/reports/zinc-next-android.md:191-213`).
3. Thermal: Pi runs ended at 1200 MHz were dropped, temperature checked under 55 C before each run (`zinc-next-perf.md:699,775`); Intel Mac held at 33-60% by heat with several builds (`AGENTS.md` "development machine", `zinc-next-perf.md:441-470` "indicative").
4. Machine load of other sessions makes numbers indicative; sections state load average per run (`zinc-next-perf.md:9-12,410,441`).
5. Vsync locked to 60 Hz: frame interval p50 16.6 ms regardless of work; "swap" of an idle frame is the display wait, so those frames are excluded (`hal_sdl.cpp:1166`). `ZINC_VSYNC=0` works on webOS EGL, SDL ignores the swap-control attribute (`hp-touchpad-webos.md:277`).
6. Software vs GPU paths give different "present" meanings (replay inside present); `glFinish` measures serialise the pipeline and over-count (`display_gl.cpp:214-215`, `zinc-next-perf.md:709`).
7. `ZINC_GL_FINISH=1` needed for per-step GPU honesty (`hal_sdl.cpp:1519`).
8. A tablet must be given to the measuring agent alone: runs with another app in front are discarded (`zinc-next-perf.md:794`).
9. Debug vs release APK: panel on vs off changes the p99 (`zinc-next-perf.md:812-813`).
10. webOS: a program started by hand registers as the app, later launches go to a dead card (`hp-touchpad-webos.md:373-375`); the card needs `/tmp/zinc/env` for env vars.
11. Software dumps lose the process (webOS stops programs): reports every 120 frames (`display_gl.cpp:219`).
12. GL driver differences: conformance known-failure lists per GPU family (`tools/webgl-conformance:11-12`); `gl_renderer.sh` skips on virtual GPUs (`tests/t1/gl_renderer.sh:8`).

## 4. Corpus candidates and determinism

- Deterministic, scene-dump-able, frame hashed: bench/render B1-B10 (hash in `bench/render.csv`), hero (`ZINC_DEMO` tour, `ZINC_FRAMES`), navigation, tests/visual four programs, galleries, breakout, boards (`framehash.golden`), rn-showcase (needs `ZINC_INPUT` script, already used for flings).
- Window-only, non-deterministic by nature: video, camera, webcam, museum-table (video, `ZINC_DEMO` not present), three/marble/pinball3d (physics and timers), music (network), remote/webrtc, webview.
- `ZINC_DETERMINISTIC=1` forces headless (`src/main.cpp:254`), so a deterministic run does not exercise the window/GL path; on a device the GL path needs `ZINC_INPUT` + `ZINC_FRAMES` with a window (`hal_dispatch.cpp:305`, `hal_sdl.cpp:445`).

## 5. Correctness and rendering problems

- Policy (`TESTING.md`, "Pixel goldens"): exact (`tol 0`, `max_diff 0`) by default against the prototype's PNGs; tolerance per entry only where a library replaces the prototype renderer; `known` rows (`over` count + reason) may not grow. Example row: ulp-level float differences on arm64 (`manifest.json`, `boards/esp32-2432s022/src/main.tsx`).
- Software raster vs GL: threshold metrics (<=5% pixels over 24 per channel, MAE < 3, wider for LINE/POLY) in `tests/t1/gl_renderer.sh:2-6`, `glcompare` and `pixel-compare` classes (edge 24, text 3, interior 2, share_gt8 0.01; `tools/pixel-compare:11-12`).
- Cross-backend: SSIM/PSNR/MAE only in `pngdiff` and `three-compare` (SSIM >= 0.90 / 0.95).
- Hash only: `ZINC_FRAMEHASH`, bench-render hash.
- Canary: `proto-capture --canary` (4 entries; `tools/proto-capture:7,85-94`), full = `--all` (T2).
- Known per-GPU or per-device failures: webGL known lists per vendor family; hero "stacked translucent glows need the raster's integer blend in the shader" (`tests/t1/gl_renderer.sh:6-7`); GL replay keeps rounded CLIPs above 32 device px square (`backlog/later.md:88`); fp16-only GPUs (Mali-400): `ZINC_GL_MEDIUMP=10` (`later.md:298`); SHADER under a matrix or rounded clip on the Android GPU layer (`later.md:252`); Android window cannot switch to GL after first frame (`later.md:253`); EGL restore after background untested (`later.md:338`); LINE/POLY skipped until ZN-181 (older); GL replay on retina Mac (`later.md:30`). `RESUME.md:12` records that GPU 60 fps scrolling on Tegra 3 is not reached (D126).

## 6. Partial

1. GPU time: GL timer query exists but only on Apple core GL (`runtime/gl_replay.cpp:106`, `display_gl.cpp:216`); no `EXT_disjoint_timer_query` path for GLES 2 (Tegra 3, Adreno 220, VideoCore IV, SGX; most do not expose it, so `glFinish` stays the fallback).
2. The profiler produces CPU phases and a Chrome trace but the numbers are text on stderr/logcat, not structured; each target parses its own (`bench-bridge parse`, `device profile` grep).
3. Device plumbing: `bench-bridge` handles four targets for one JSON schema (microseconds per unit of a bench program); `device profile` handles Pi text; none carries a render artifact.
4. `bench-render` replays on the software raster only; no GL replay mode of `--scene --bench`, no device run.
5. Pixel comparison has 5+ different tools and tolerances (golden tol, classes, SSIM, glcompare, hash); no single "diff report" per device and backend.
6. Frame hash is of the software frame (`gfx.cpp:935`); the GPU's displayed frame is only compared through `ZINC_SHOT` BMP/PNG + `glcompare` on the Mac.
7. Present split is in the SDL HAL only (`ZINC_PRESENT_STATS`), separate from `ZINC_PROFILE`.
8. Frame interval/jank counts ("late of 720") are computed by hand from `ZINC_PRESENT_STATS` or SurfaceFlinger; there is no built-in "frames late" counter.
9. Energy and thermal: `resmon --energy` on the host only; Pi temperature read by hand; no Android/iOS/webOS energy/thermal logging.
10. Env passing to release apps is limited to a whitelist on Android (`shell_sdl.cpp:177`).
11. The corpus is split between `bench/render`, `tests/visual`, examples and per-task scripts; only B1-B10 + two apps are listed in one place.

## 7. Missing

- A rendering bench artifact format (JSON per machine and backend) next to `docs/reports/bench/script-bridge-*.json`.
- A render bench program/runner that runs a fixed list of scenes on a device (window, GL, scripted input, N frames) and collects CPU phases, present split, GPU time, interval distribution, and a frame hash/PNG.
- Metal GPU timing on iOS/macOS (`MTLCommandBuffer.GPUStartTime/GPUEndTime`, completion handler, presented time) and a Metal renderer of command lists to time.
- Vulkan: no backend, no design doc.
- GPU timing on GLES 2 devices (disjoint timer query when available, else documented glFinish fallback), recorded with a flag saying which.
- Frame-pacing statistics in the engine: frame interval p50/p99, count of frames over 1.5x vsync, dropped frames (only measured by hand).
- Per-device pixel baselines: goldens exist only from the prototype (host) and per-feature; no device-rendered frame is stored to compare an A9X, Tegra 3, Adreno 220 frame with the Mac's. No SSIM/PSNR on device frames.
- A "rendering problems" log: structured list of per-device known differences (today spread over `later.md`, T1 comments, manifest `known` rows, webgl known lists).
- Environment capture in the artifact: governor, frequency, temperature, battery, display refresh rate, GL vendor/renderer strings (only `ZINC_GL_INFO` / `glGetString` at `hal_sdl.cpp:230`), build type, engine version/commit (bench-bridge writes a machine block, to reuse).
- Pi, ESP32 and TouchPad run of `bench-render`: the Pi does have `device profile` but no artifact.
- Thermal/sustained runs (long loops with throttle logging).
- Regression gate for GPU paths (`bench-render --check-regressions` covers software only).

## 8. Summary (10 lines)

1. The CPU side is well instrumented: `ZINC_PROFILE` phases with p50/p99/max (`runtime/gfx.cpp:368-431`), Chrome trace, perf HUD, command and damage stats.
2. `ZINC_PRESENT_STATS` splits raster / upload / draw / swap / interval, only in the SDL HAL (`hal_sdl.cpp:1126`).
3. GPU time exists only through `GL_TIME_ELAPSED` on Apple core GL (`gl_replay.cpp:106`); GLES 2 devices fall back to `glFinish` and inference.
4. iOS "Metal" is a blit of the software raster (`hal_metal.mm`); there is no Metal renderer and no GPUStart/End, completion or presented-time code; Vulkan has no code or design.
5. `bench-render` + `bench/render/*.ts` + `render.csv` (median, p99, hash, 1 and 4 threads, regression gate) is the best base for a corpus but runs the software raster on the Mac only.
6. `bench-bridge` already gives build, install, run, collect and JSON per machine on Mac, Nexus 7, TouchPad, iPad; the Pi has `tools/device profile`.
7. Real-hardware history is rich but in prose tables in `zinc-next-perf.md`, not in comparable artifacts.
8. Known pitfalls are well documented (su, governors, thermal, vsync, glFinish, load) but not captured in the artifact.
9. Pixel comparison is plentiful (`pngdiff`, `pixel-compare`, `glcompare`, `proto-capture`, `three-compare`) but host-only and inconsistent in metrics and tolerances.
10. Determinism hooks (`ZINC_INPUT`, `ZINC_FRAMES`, `ZINC_DEMO`, `ZINC_FRAMEHASH`, `ZINC_SHOT`) exist and work on real windows, so a scripted corpus is feasible.

## 9. Eight biggest gaps

1. No structured per-machine rendering artifact (JSON with environment, backend, scene, phases, present split, GPU, interval, hash).
2. No device-capable render runner: `bench-render` is host and software only.
3. GPU time on GLES 2 and Metal (and Vulkan later): absent except Apple GL.
4. No frame-pacing/jank metric (interval p99, late frames, drops) in the engine; vsync wait is mixed into PRESENT under `ZINC_PROFILE`.
5. No pixel baseline from device frames; cross-device and cross-backend correctness is checked by ad hoc thresholds and only on the host.
6. No single rendering-problem registry (known differences are scattered across `later.md`, manifest `known`, webgl known lists, test comments).
7. Environment/thermal/governor/energy not recorded with the numbers although they explain most past surprises.
8. No Metal command-list backend or Vulkan backend design yet to hang timing on; the scene dump (`ZINC_SCENE_DUMP`) is the ready common input.

## 10. What to reuse

- Plumbing: `tools/bench-bridge` (build, install, run, collect for mac / android / webos / ios, `show` table, machine block, `docs/reports/bench/` layout); `tools/device` for Pi.
- Corpus and gate: `bench/render/*.ts`, `tools/bench-render` (hash + 15% gate), `src/host/render_bench.cpp`, `ZINC_SCENE_DUMP` format (`include/zn/scene.h`).
- Phase data: `ZINC_PROFILE` ring and `stat_line` (`runtime/gfx.cpp:405`), Chrome-trace writer, `ZINC_PRESENT_STATS` columns, `ZINC_GL_STATS` counters.
- GPU timer: the 4-deep query ring in `runtime/gl_replay.cpp:106-120` (extend with `EXT_disjoint_timer_query` and a Metal equivalent in `hal_metal.mm`).
- Determinism: `ZINC_INPUT`, `ZINC_FRAMES`, `ZINC_DEMO=bench` (hero), `ZINC_FRAMEHASH`, `ZINC_SHOT`.
- Pixels: `pngdiff` (SSIM/PSNR/MAE), `pixel-compare` classes, `proto-capture` manifest with `known` rows, `webgl-conformance` per-family known lists as the model for per-device known-problems.
- Method notes: `docs/targets/adapting-to-hardware.md:106-115`, pitfalls in `docs/reports/zinc-next-android.md:177-213`, `docs/reports/hardware/hp-touchpad-webos.md:356-368`.
