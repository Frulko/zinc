# zbench: one tool to measure rendering (and the script boundary) on every machine (2026-10-18)

Why: measuring Zinc meant launching dozens of different programs with different switches and reading text from stderr, logcat, os_log or a novacom pipe.
Nothing was comparable between a Mac, a Nexus 7 and an iPad, nothing recorded the machine's state, and a hash, a stall or a thermal drift went unseen.
`next/tools/zbench` is the single entry point: one corpus of scenes, one app per device (not one app per scene), one JSON format, one comparison, one gate.
Inputs behind it: `render-bench-audit.md` (what the engine could already measure), `render-bench-research.md` (the methods that experts trust; claims tagged V or U there).

## What runs

```sh
tools/zbench run mac                         # the render suite on this Mac: 12 scenes x 3 runs, interleaved
tools/zbench run android                     # a Nexus 7 over adb: export, Gradle, install, one launch per scene and run
tools/zbench run ios --app-id dev.zinc.X     # an iPhone or iPad over USB (replaces the app X; no contact with Apple; see ipad-16-bringup.md)
tools/zbench run webos                       # an HP TouchPad over novacom (adapter written, not yet run on the device)
tools/zbench run android --suite boundary    # the zinc:script boundary suite (tools/bench-bridge)
tools/zbench show A.json B.json              # one table, a column per machine, ratios to the first
tools/zbench gate BASE.json NEW.json         # exit 3: slower than the noise allows; exit 4: a rendering problem
```

Options: `--scene a,b`, `--runs N` (3), `--frames N` (240), `--skip N` (30 warm-up frames not counted), `--mode uncapped|paced|both`, `--size WxH` (Mac window), `--no-build`.

## The corpus (`next/tests/bench/render_suite`)

One program, one scene per launch (`ZB_SCENE=<id>`); every scene is seeded, driven by the frame number (never the clock) and draws the same commands on every backend,
and every frame differs from the one before by one colour bit so the whole frame is damaged and repainted (the worst case a screen can ask).
`fill_opaque` and `fill_blend` (fill rate, eight screens), `quads_10k` (command overhead), `rounded_shadow` (anti-aliased shapes, blurs), `gradients`, `text_static` and
`text_churn` (glyph cache hits and churn), `clip_nested`, `poly`, `scroll_list`, `image_update` (a 256x256 texture changes every frame), `damage_small` (a small moving square on a static
decoration: does damage tracking pay). More scenes: add a `case` and its id to `ids` in `src/main.ts` and to `SCENES` in `tools/zbench`. 3D, video and UI-toolkit scenes are not in yet.

## What is measured, and by whom

The engine measures its own frames (no external profiler, so the same on every device): `ZINC_PROFILE=json` prints one line with, per phase (app, input, anim, layout, paint, effects, diff, raster, present),
for `work` (every phase but present) and for `interval` (the time between two frame starts): p50, p99, max and mean in microseconds; counts of late frames; the surface size; and what the display
driver knows. `ZINC_PROFILE_SKIP` leaves the warm-up out. On the GL renderer the driver publishes `gl_vendor`, `gl_renderer`, `gl_version`, draw calls and quads per frame, `gl_cpu_submit_us` and `gl_gpu_us`
(the GL_TIME_ELAPSED query where the GPU has it; 0 where it has not). `ZINC_FRAMEHASH=last` gives the hash of the last frame. Code: `runtime/gfx.cpp` (profiler), `runtime/gl_replay.cpp` (GL counters).
`zbench` adds the machine: model, OS, CPU and GPU, governor and frequencies, temperatures, battery, load, refresh rate, before and after the whole run.

Reading a column: `w` CPU work p50 (everything the program, the layout and the painting did), `p` present p50 (the HAL: GPU submit, swap, the vsync wait when paced), `gpu` GPU time per frame where the driver gives it,
`i` interval p50 and p99, `fps` from the interval, `L` frames over 16.7 ms of work, `±` the run-to-run spread over the median (the noise floor of that scene on that machine), `V` vsync-locked, `x` ratio of the work p50 to the first column.
The figure is the median of the per-run medians. A mean is never reported (docs/reports/render-bench-research.md section 1).

## Problems are recorded, not hidden (`modes.<mode>.problems`)

`run_failed` and `flaky_launch` (a launch that printed no profile: timeout or crash; it is retried once and the first failure stays in `raw[].first_failure`), `frame_hash_unstable` (the last frame differs between runs of one
scene: non-deterministic drawing or a driver defect), `frames_missing`, `noisy` (spread over 10%), `stutter` (paced, more than 2% of frames over 25 ms). `gate` also reports a frame hash that changed between two artifacts of the same device.

First finding by the tool itself (2026-10-18, Mac): `text_churn` hung once in a loop of 3 runs of 12 scenes (no output after the GL program was built, 120 s timeout) and ran fine in six standalone runs with the
same frame hash; recorded as `flaky_launch`, not yet explained.

## The artifact (`docs/reports/bench/zbench-render-<device>-<model>-<date>.json`, schema `zbench/1`)

`tool` (git revision, dirty flag of the engine sources), `device.before` and `device.after`, `config` (frames, skip, runs, modes, size), and per mode: `scenes.<id>` (the summary: `work_p50_us`, `work_p99_us`,
`interval_p50_us`, `interval_p99_us`, `raster_p50_us`, `present_p50_us`, `frames`, `fps`, `spread`, `vsync_locked`, late counts, `frame_hashes`, `gpu` = the driver's strings and the median of its counters),
`problems`, and `raw` (every run's full profile, the frame hash and, for a failed launch, the last log lines).

## Limits to know (found while building it)

- **`uncapped` is not uncapped on a Mac window**: with `ZINC_VSYNC=0` the SDL GL window still ran at about 9.6 ms a frame on the M1 Pro (work 0.15 ms, present 0.8 ms), a limiter outside the measured phases (the compositor for a window that does not take the focus, App Nap, or the loop).
  `gpu` and `p` are the usable costs there; `fps` is not a throughput. `ZINC_VSYNC=0` is honoured by the SDL GL window HAL only: on iOS (Metal blit) and webOS the run is paced; `vsync_locked` says what the machine gave.
- **No GPU timer on GLES 2 devices yet**: `gl_gpu_us` exists where `GL_TIME_ELAPSED` does (Apple GL). Tegra 3, Adreno 2xx, VideoCore IV and the TouchPad have no data (the research found none); the tool records 0 and the cost has to be read from `present` and differential scenes
  (a scene with minus a scene without a feature). A `timer_source` tag per number and an `EXT_disjoint_timer_query` probe are the next steps; never put two sources on one axis.
- **iOS Metal is a single blit** of the software raster (`targets/macos/hal_metal.mm`): there is no GPU timing to take until the Metal command renderer exists (`later.md`); Vulkan has no code. The schema carries per-backend `gpu` fields so they can be filled when they do.
- **Pixels**: only a hash of the last frame (`ZINC_FRAMEHASH`) is compared, which is exact within one backend on one device class and says nothing across GPUs. Tolerant comparison (counts over a delta, a diff PNG; `pngdiff`, `pixel-compare`, FLIP) needs screenshots from devices: not in yet.
- **State not yet controlled**: governors and clocks are recorded, not forced; on the Nexus 7 `su` perturbs frame times (the tool does not use it for scenes); a tablet must be left alone while measured. Thermal drift is spread by interleaving, and visible in `device.before` against `after`.
- The Mac numbers come from a window launched with `ZINC_BACKGROUND=1` (it does not take the focus): other windows over it, App Nap and the display's refresh change the `interval`.
- Static scenes do not exist in the corpus: the engine repaints only damaged areas, so a frame identical to the last measures nothing. `damage_small` is the one scene that shows partial damage.

## Next

1. A `timer_source` tag and an `EXT_disjoint_timer_query` probe for GLES 2, then Metal command-buffer times and Vulkan timestamps when those backends land (the engine publishes them through `zrt_prof_info`, the same hook).
2. Device screenshots per scene and a tolerant comparison against a per-device baseline; a registry of known rendering problems per GPU family (the model: `proto-capture` `known` rows and the WebGL known lists).
3. Scenes for 3D, video, the UI toolkit (a scripted scroll, a form) and an adaptive scene that finds the largest count held at 60 fps.
4. The TouchPad adapter run, a Raspberry Pi adapter (`zinc device`), thermal and clock control per device, and `gate` in the CI of the tablets that have one.

## Update 2026-10-19: one launch, a report file, five devices

What changed after the first tables, and why (each cost hours; the pitfalls are the point of this section):

- **One launch for the whole suite.** The program runs the 19 scenes one after the other (`ZB_SCENE=all` or a list, `ZB_PER` frames each, a scene slower than `ZB_MAXS`=12 s is closed with the frames it got).
  The engine closes a profile section after each scene (`zinc:gfx profSection(label)`: the numbers as JSON, the hash of the frame on screen, the counters and the warm-up start again).
  `--one-by-one` keeps the old launch per scene to isolate a scene that breaks the others.
- **The app writes its own report, the tool pulls it.** `ZB_OUT` names the file (`zbench-report/1`: `run`, `surface`, `done`, `sections`), written after each scene; `ZB_RUN` makes a stale file
  from the last run harmless. Pulled with the device's own file transfer: `adb run-as` (the debug APK's data directory), `novacom get`, `ssh cat`, the iOS app container (`pymobiledevice3 apps pull`), a file on the Mac.
  No log is read any more: iOS cuts a message at about 1000 characters, logcat's ring loses lines, a webOS card logs stderr only and reads environment lines of 255 characters (now 2047),
  and no log says when a run is over.
- **The surface size is read at the first frame.** Before the window exists `width()` is 320 x 240 on every display but a KMS screen: the first tables drew in 320 x 240 on a 1280 x 704 screen. `zbench` records the size drawn and flags `surface_mismatch`.
- **Raspberry Pi.** `zbench run pi` (ssh; `ZINC_PI`, `--host`): three screen configurations, `pi720` and `pi1080` (`ZINC_GL_MODE`, the KMS mode picked at run time) and `pi720up` (1080 mode, a 1280x720 surface scaled by the GPU).
- **Engine switches without a rebuild**: `--set K=V,K=V` (ZINC_GL_RCLIP=0, ZINC_GL_OCCLUDE=0 ...), `--tag` names the artifact of an experiment, `--backend auto,cpu,gl,glfinish,gl_nooccl,pi720,pi1080,pi720up`.
- **Several adb devices**: set `ANDROID_SERIAL` (a second network device made every command fail silently). **An iPad after a reboot** has no Developer Disk Image mounted: open Xcode > Window > Devices.
- **GPU timers on GLES 2**: `EXT_disjoint_timer_query` where the driver has it, `ZINC_GL_TIMER=finish` (a `glFinish` bracket, an upper bound that serialises the pipeline) otherwise, `gl_timer_source` says which; Tegra 3 has none and the TouchPad's Adreno 220 neither.
- Findings the suite produced: `docs/reports/pi-1080p.md` (the Pi 3B+ at 1080p), `docs/reports/low-end-gpu-perf-ideas.md`.
