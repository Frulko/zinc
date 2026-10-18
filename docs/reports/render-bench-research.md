# Render benchmark and diagnosis suite: research

Date 2026-10-18. Web research only. Tags: **[V]** = read on the cited page during this research; **[U]** = UNVERIFIED (background knowledge or the page could not be read; the URL is where to confirm). Several fetches returned only titles or the wrong page (MotionMark README, Flutter metric names, Metal docs, Perfherder docs, Skia Gold internals): those claims are [U].

## 1. Frame-time methodology

- Report the distribution, never the mean. Android Macrobenchmark `FrameTimingMetric` reports `frameDurationCpuMs` and `frameOverrunMs` at P50/P90/P95/P99, and advises looking at P95/P99; `frameOverrunMs` > 0 means a missed deadline, < 0 is slack; overrun needs Android 12 (API 31) [V] https://developer.android.com/topic/performance/benchmarking/macrobenchmark-metrics
- Budget: 16 ms at 60 fps, 11 ms at 90, 8 ms at 120; a frame that misses is dropped, not shown 1 ms late. Android calls slow 16-700 ms and frozen 700 ms-5 s [V] https://developer.android.com/topic/performance/vitals/render
- Android FrameTimeline (Android 12+, SurfaceViews unsupported): expected vs actual timeline per frame, jank classes (AppDeadlineMissed, BufferStuffing, SurfaceFlinger CPU/GPU deadline missed, DisplayHAL, PredictionError); tables `expected_frame_timeline_slice`/`actual_frame_timeline_slice` with `jank_type`, `on_time_finish`, `present_type` [V] https://perfetto.dev/docs/data-sources/frametimeline . "Light green = smooth but late" shows that buffer stuffing adds latency without a miss: record queue depth.
- Flutter: profile mode on a real device, ideally the slowest target; simulators mislead; DevTools separates UI and GPU graphs; saveLayer, clips, shadows, uncached images are the usual raster costs [V] https://docs.flutter.dev/perf/ui-performance . The timeline summary keys (build/raster average, p90, p99, `missed_frame_budget_count`) come from `integration_test` `watchPerformance`/`flutter drive --profile` [U for exact key names] https://api.flutter.dev
- MotionMark: adaptive complexity, score = largest element count that holds ~60 fps, with a bootstrap confidence interval [U] https://browserbench.org/MotionMark1.3/ and https://github.com/WebKit/MotionMark . Lesson for Zinc: a "how much can it draw at 60 fps" number is more portable across a Tegra 3 and a desktop than ms at a fixed load. Also keep fixed-load scenes for regression.
- Vsync-locked vs uncapped: vsync hides GPU headroom (quantises to 16.7 ms steps). Measure both: (a) paced run for jank/latency, (b) uncapped or offscreen run for throughput (GFXBench "offscreen" tests do this) [U] https://gfxbench.com . When uncapped is impossible (platform forces vsync), use GPU time and CPU time per frame instead of present interval.
- Warm-up and steady state [U, general practice]: discard the first N frames (shader compile, cache fill, atlas build, JIT of the VM); record cold-start frames separately as their own metric. Run long enough to reach thermal steady state on passively cooled devices (minutes), and log a sustained-vs-burst pair.
- Thermal: record temperature, CPU/GPU clocks, governor, battery/plugged at start, mid, end of each run; fix governor to performance where root is available, else just record it. On a Mac, `powermetrics`; on Pi `vcgencmd get_throttled` and `measure_temp` [U] https://www.raspberrypi.com/documentation/computers/os.html#vcgencmd
- Variance and statistics [U, standard practice]: 5-10 independent process launches per scene; per-run p50/p95/p99; compare builds with the median of per-run medians, a bootstrap CI of the difference, and a Mann-Whitney U test (frame times are not normal). Interleave A/B runs on the device, rather than all A then all B, to cancel drift. Report jank as count and as share of frames over budget; a histogram with log-ish buckets (0-4, 4-8, 8-12, 12-16.7, 16.7-25, 25-33, 33-50, 50-100, >100 ms).
- Input-to-photon latency: needs an external camera or photodiode for truth [U]; in software, record input event timestamp to the present/vsync timestamp as a proxy and say so. Vulkan `VK_KHR_present_wait` returns when the image is visible, "as close as possible to when the first pixel appears" [V] https://docs.vulkan.org/refpages/latest/refpages/source/VK_KHR_present_wait.html
- Other tools to learn from [U]: Chrome tracing/about:tracing (https://www.chromium.org/developers/how-tos/trace-event-profiling-tool/), Apple Instruments/Metal System Trace (https://developer.apple.com/documentation/xcode/gathering-information-about-gpu-performance), Unreal `stat unit`/`stat gpu` (https://dev.epicgames.com/documentation/en-us/unreal-engine/stat-commands-in-unreal-engine), Unity Frame Timing Manager (https://docs.unity3d.com/ScriptReference/FrameTimingManager.html).

## 2. GPU-side timing per API

| API | Mechanism | Precision / limits | Availability |
|---|---|---|---|
| GLES 2/3 | `EXT_disjoint_timer_query`: `TIME_ELAPSED_EXT`, `QueryCounterEXT(TIMESTAMP_EXT)`, `GPU_DISJOINT_EXT` | ns units, granularity implementation-defined, >= 30 bits (~1 s) so read 64-bit; one TIME_ELAPSED active at a time (no nesting); check availability without blocking; any disjoint event (power sleep) invalidates results; written against ES 2.0 [V] https://registry.khronos.org/OpenGL/extensions/EXT/EXT_disjoint_timer_query.txt | Patchy. Anecdotes: Adreno 420 returned 0, Adreno 320/330/530 failed a Mozilla conformance test, one PowerVR device passed, Mali-G71 passed, iPad mini retina (SGX543) lacks it [V as anecdotes] https://qualcomm.com/comment/9326 , https://bugzilla.mozilla.org/show_bug.cgi?id=1290030 , https://bugs.webkit.org/show_bug.cgi?id=129090 . Tegra 3, VideoCore IV, TouchPad (Adreno 220-class): no data found, UNVERIFIED; probe at runtime with `glGetString(GL_EXTENSIONS)`. |
| Desktop GL | `ARB_timer_query` / GL 3.3 core `GL_TIME_ELAPSED`, `glQueryCounter` | ns, solid | Any GL 3.3+ [U] https://registry.khronos.org/OpenGL/extensions/ARB/ARB_timer_query.txt |
| Metal | `MTLCommandBuffer.gpuStartTime/gpuEndTime` (read after completion; whole command buffer) | Per command buffer; coarse but universal [U, page unreadable] https://developer.apple.com/documentation/metal/mtlcommandbuffer/gpustarttime . `MTLCounterSampleBuffer` with `.atStageBoundary` / `.atDrawBoundary`: support varies by device and stage-boundary is the less common one; check `device.supportsCounterSampling(_:)`; results are GPU ticks that must be converted [U] https://developer.apple.com/documentation/metal/mtlcountersamplebuffer . A9X (Apple GPU family 3): expect only command-buffer times plus possibly stage-boundary; UNVERIFIED, probe at runtime. `MTLDrawable.presentedTime` (and `addPresentedHandler`) for on-glass time [U] | iOS 10+/macOS 10.12+ for buffer times [U] |
| Vulkan | `vkCmdWriteTimestamp` (superseded by `vkCmdWriteTimestamp2`); multiply by `VkPhysicalDeviceLimits::timestampPeriod`; queue family needs `timestampValidBits` > 0; wraps on overflow; queries must be reset first; monotonic, device time domain; with `VK_*_calibrated_timestamps` comparable across submissions and to the CPU clock [V] https://docs.vulkan.org/refpages/latest/refpages/source/vkCmdWriteTimestamp.html . `VK_KHR_present_id` + `VK_KHR_present_wait` for visible-time [V]. `VK_GOOGLE_display_timing` gives past presentation timings on Android/Linux drivers that expose it [U] https://registry.khronos.org/vulkan/specs/latest/man/html/VK_GOOGLE_display_timing.html | ns-class; tiled GPUs timestamp at stage boundaries so per-draw values are muddy | Desktop and modern Android; none on a 2012 tablet |
| Android system | `dumpsys gfxinfo <pkg> framestats` (per-frame timestamps table) [U, the page did not cover it] https://developer.android.com/training/testing/performance ; `dumpsys SurfaceFlinger --latency <layer>` [U]; FrameTimeline/Perfetto on 12+ [V]; `Choreographer` frame callbacks, `FrameMetrics` | ms-class, free, no engine change | gfxinfo framestats API 23+ [U]; SurfaceFlinger --latency older |
| Desktop vendor tools | RenderDoc, NVIDIA Nsight, AMD RGP, Intel GPA, Xcode GPU capture [U] | Per-draw, high overhead; for diagnosis, not the suite | Desktop |

Tile-based deferred renderers (PowerVR, Mali, Adreno, VideoCore IV tile mode, Apple): vertex work for the whole frame can run before any fragment work, and fragments run per tile at the end, so a timer around one draw call does not measure that draw. Measure per render pass or per frame, and attribute cost by scene (differential: scene with feature minus scene without) [U, widely documented; e.g. https://developer.arm.com/documentation/102662/latest/ and Apple's TBDR docs https://developer.apple.com/documentation/metal/tailor_your_apps_for_apple_gpus_and_tile-based_deferred_rendering].

No timer query? See section 9.

## 3. Synthetic scene corpus: one cost per scene

Each scene changes one dimension and holds the rest fixed; each has a fixed-load variant (regression) and, where sensible, an adaptive variant (find the max count that holds the budget, like MotionMark).

1. Fill rate: N full-screen opaque quads; then the same with alpha (blending); overdraw layers 1/2/4/8.
2. Blending and compositing: alpha rects, premultiplied vs not, opacity groups (offscreen layer) vs direct.
3. Gradients, rounded rects, borders, box shadows (blur radius sweep), blur/backdrop filters: separate scenes (Flutter flags saveLayer/clip/shadow as GPU hotspots [V]).
4. Text: single large paragraph, many small labels, glyph-atlas churn (many distinct glyphs/sizes, CJK), per-frame changing text, subpixel scrolling text.
5. Draw-call/command overhead: 10k tiny rects in one batch vs 10k separate draws; state changes; dirty-rect partial updates vs full redraw.
6. Texture upload: per-frame `glTexSubImage2D` of N KB, atlas churn, mip generation, compressed vs RGBA; video-frame upload.
7. Scrolling a long list (10k rows with text + image + shadow): fling and steady scroll, the classic UI jank case (Macrobenchmark scrolls lists [V]).
8. Large images: decode + upload + draw at 1x/downscale; memory pressure on 512 MB devices.
9. Clipping: rect, rounded, arbitrary path; nested.
10. Layers/offscreen: render-to-texture passes, N layers per frame.
11. Geometry 3D: triangle count sweep, instancing absent on GLES2, vertex-bound vs fragment-bound.
12. Shader complexity: ALU loops sweep, texture fetch count sweep, dependent reads.
13. Idle/animation-light: one small animated element (power and wakeups, not throughput).

Suites to learn from [U unless noted]: GFXBench (Manhattan/T-Rex, offscreen variants) https://gfxbench.com ; 3DMark Wild Life https://www.3dmark.com/wildlife ; glmark2 (per-scene fps list, works on GLES2 and Pi) https://github.com/glmark2/glmark2 ; Basemark; MotionMark https://browserbench.org/MotionMark1.3/ ; Skia `nanobench`/`skpbench` (skpbench measures GPU frames at steady rate, reporting percentiles of timestamp-derived times) https://skia.org/docs/dev/testing/ ; Flutter benchmarks (flutter_gallery, `dev/benchmarks`) https://github.com/flutter/flutter/tree/master/dev/benchmarks ; WebRender `wrench` and perf reftests https://github.com/servo/webrender/tree/master/wrench ; Chromium `tools/perf` rendering benchmarks https://chromium.googlesource.com/chromium/src/+/main/docs/speed/ .

## 4. Detecting rendering problems

- Compare against a reference with a tolerance, not a hash, across different GPUs/drivers. Hash equality is valid only inside one backend + one device class (e.g. the software raster against itself: Zinc's "byte for byte" oracle). Keep per-backend golden sets where bit-exactness holds.
- Metrics: per-pixel max channel delta with a count of pixels over threshold (cheap, explainable); SSIM [U] https://en.wikipedia.org/wiki/Structural_similarity ; NVIDIA FLIP perceptual error maps, BSD-3, accepts PNG, outputs error maps [V] https://github.com/NVlabs/flip . Recommend: gate on "pixels with delta > T1 exceed fraction F" plus a max delta, write an error-map PNG for humans; FLIP optional.
- Legit differences: precision (mediump on mobile), rounding of coverage, MSAA sample patterns, texture filtering, gamma/sRGB. Approach: tolerance per test (e.g. 2-3 levels per channel; larger on gradient and blur scenes) and an edge-mask rule (ignore pixels adjacent to high gradients, or allow N edge pixels). Skia Gold stores images by digest, triages positive/negative per digest, baselines kept in lockstep with commits, results split by OS/arch/backend [V] https://skia.org/docs/dev/testing/skiagold/ ; fuzzy/Sobel matching options [U] https://github.com/google/skia-buildbot .
- Others: WebRender reftests (two pages that must render the same, with per-test fuzzy allowances) [U] https://github.com/servo/webrender/tree/master/wrench ; Khronos CTS/dEQP for driver conformance (compare-with-tolerance, with a failing-test list per device) [U] https://github.com/KhronosGroup/VK-GL-CTS ; WebGL conformance https://github.com/KhronosGroup/WebGL .
- Defect record: scene id, frame number, backend, device, driver strings (`GL_RENDERER`, `GL_VERSION`), region bbox of differing pixels, metric values, paths to actual/expected/diff images, app build hash, shader/compile log if any, `glGetError` after the frame. Also record invariants that are not pixels: GL errors, shader compile/link failures, NaNs, texture-size fallbacks, "feature skipped" flags.

## 5. Result schema and regression detection

- Perfetto traces for deep dives (open format, SQL queryable) [V for FrameTimeline tables]; keep summary JSON for the dashboard.
- Mozilla Perfherder takes JSON with framework, suites, subtests, values and `lowerIsBetter`, alerts via statistical change detection [U, docs page not readable] https://firefox-source-docs.mozilla.org/testing/perfdocs/perfherder.html . Chromium/Skia Perf: traces keyed by dimensions (os, gpu, config, test), change-point detection over commit history [U] https://skia.org/docs/dev/testing/skiaperf/ . Flutter pushes benchmark JSON to its dashboard [U] https://github.com/flutter/flutter/wiki/Writing-a-render-speed-test-for-Flutter . Android Jetpack Benchmark writes JSON for CI [U] https://developer.android.com/topic/performance/benchmarking/benchmarking-in-ci .
- Regression detection: store raw samples (not only summaries); compare against a baseline window of recent commits on the same device; flag when the median shift exceeds max(15% gate, 3x robust noise estimate such as MAD) and passes Mann-Whitney; use change-point detection (e.g. E-divisive/PELT [U]) on the history for slow drifts. The repo already has a 15% `bench-gate` (AGENTS.md); keep the same threshold but add the noise floor per device.
- Environment fields: see JSON below.

## 6. Per-platform hooks

- Android: `adb shell dumpsys gfxinfo <pkg> framestats` [U], `dumpsys SurfaceFlinger --latency`, Perfetto (`android.surfaceflinger.frametimeline` data source on 12+ [V]) and systrace on older [U], `simpleperf` https://developer.android.com/ndk/guides/simpleperf [U], thermal: `/sys/class/thermal/thermal_zone*/temp`, `dumpsys thermalservice` (API 29+) [U], CPU freq `/sys/devices/system/cpu/cpu*/cpufreq/scaling_cur_freq`, governor `scaling_governor`. Nexus 7 2012 (Tegra 3, LOS 14.1, Android 7.1): gfxinfo framestats exists (API 23+), FrameTimeline does not; GPU load on Tegra via `/sys/devices/platform/host1x/gr3d/...` UNVERIFIED, probe.
- iOS (A9X iPad, iOS 16 class): `os_signpost` intervals visible in Instruments (needs recent Xcode; check what is installed) [U] https://developer.apple.com/documentation/os/logging/recording_performance_data ; `CADisplayLink` `timestamp`/`targetTimestamp` for frame pacing; `CAMetalDisplayLink` is iOS 17+ so not on iOS 16 [U] https://developer.apple.com/documentation/quartzcore/cametaldisplaylink ; MetricKit gives aggregated field data, not per-run [U]; `MTLDrawable.presentedTime`; `ProcessInfo.thermalState` and `ProcessInfo.isLowPowerModeEnabled` for thermal/power flags [U]. Fallback that always works: engine-side CPU timestamps + command-buffer GPU times, written to a JSON file pulled with the device tooling.
- Linux / Raspberry Pi: `vcgencmd measure_temp`, `get_throttled`, `measure_clock arm|core|v3d`, `/sys/class/thermal/thermal_zone0/temp`, cpufreq files, `perf` [U] https://www.raspberrypi.com/documentation/computers/os.html#vcgencmd ; Mesa `GALLIUM_HUD` for v3d/vc4 (fps, GPU load) [U] https://docs.mesa3d.org/envvars.html ; DRM vblank timestamps via `drmWaitVBlank`/page-flip events [U] https://man7.org/linux/man-pages/man7/drm-kms.7.html . Pi 3B+ uses VideoCore IV (vc4 driver, GLES 2): timer queries not expected, UNVERIFIED.
- webOS (HP TouchPad 3.0.0): nothing official known; use engine-side counters plus `/sys` thermal and cpufreq files over novacom; UNVERIFIED, probe on the device.
- macOS: Metal HUD (`MTL_HUD_ENABLED=1`) [U] https://developer.apple.com/documentation/xcode/monitoring-your-metal-apps-graphics-performance ; `powermetrics --samplers gpu_power,thermal,cpu_power` [U]; Instruments Metal System Trace; `pmset -g therm`.

## 7. Recommended metric set

Per frame (cheap, always on, ring buffer, no allocation in the loop):
- frame index, scene id, phase (warmup/measure)
- t_start (monotonic ns), cpu_total_ms, cpu_by_stage_ms (layout, paint/record, raster or encode, submit)
- gpu_ms (nullable; source tag: `timer_query`, `cmdbuf_time`, `finish_bracket`, `none`)
- present_interval_ms (vsync-to-vsync or present timestamp delta) and `present_source` tag
- draw_calls, vertices, state_changes, texture_uploads_bytes, atlas_misses, pixels_drawn (overdraw estimate), allocations_bytes, rt_switches
- dropped/missed flag (interval > 1.5 x refresh or gpu/cpu over budget), disjoint flag, gl_error
- sampled every K frames: temperature, cpu/gpu freq, battery level

Per scene (computed from the frames after warmup):
- n_frames, wall_ms, fps_mean, p50/p90/p95/p99/p99.9 for cpu_ms, gpu_ms, interval_ms, max, stddev, MAD
- jank_count (>1.0x budget), severe_jank_count (>2x), longest_stall_ms, histogram buckets
- adaptive scenes: max_complexity_at_budget with its CI
- warmup_ms and first_frame_ms (cold cost), peak RSS, GPU memory if known
- thermal: temp start/end, clock min/max, throttled flag
- correctness: diff metrics vs reference, GL errors count, shader failures

## 8. Recommended artifact schema (JSON)

```json
{
  "schema": 1,
  "run_id": "uuid", "started_utc": "ISO8601", "suite": "render", "suite_version": "1.0",
  "app": { "build_hash": "git sha", "dirty": false, "zinc_version": "", "build_type": "Release", "compiler": "", "flags": "" },
  "device": {
    "id": "stable-name", "model": "", "soc": "", "cpu": { "arch": "", "cores": 0, "max_mhz": 0 },
    "ram_mb": 0, "os": "", "os_build": "", "kernel": ""
  },
  "gpu": {
    "backend": "gles2|gles3|vulkan|metal|software",
    "gl_vendor": "", "gl_renderer": "", "gl_version": "", "glsl_version": "", "gl_extensions_hash": "",
    "vk_device_name": "", "vk_driver_version": "", "vk_api_version": "", "vk_timestamp_period_ns": 0, "vk_timestamp_valid_bits": 0,
    "metal_device": "", "metal_gpu_family": "", "metal_counter_sampling": ["atStageBoundary", "atDrawBoundary"],
    "timer_source": "timer_query|cmdbuf_time|finish_bracket|none", "max_texture_size": 0
  },
  "display": { "width": 0, "height": 0, "scale": 1.0, "refresh_hz": 60.0, "vsync": true, "present_source": "" },
  "conditions": {
    "power": "plugged|battery|unknown", "battery_pct": null, "governor": "", "low_power_mode": null,
    "temp_start_c": null, "temp_end_c": null, "thermal_state": "", "throttled": null,
    "background_load_note": "", "headless": false, "deterministic": false
  },
  "scenes": [{
    "id": "fill.alpha.x4", "params": {}, "mode": "fixed|adaptive|uncapped|paced",
    "runs": 5, "warmup_frames": 60, "measured_frames": 600, "budget_ms": 16.67,
    "metrics": {
      "interval_ms": { "p50": 0, "p90": 0, "p95": 0, "p99": 0, "p999": 0, "max": 0, "mean": 0, "mad": 0, "hist": [] },
      "cpu_ms": {}, "gpu_ms": {}, "jank": 0, "severe_jank": 0, "longest_stall_ms": 0,
      "counters": { "draw_calls": 0, "tex_upload_bytes": 0, "pixels": 0 }
    },
    "per_run_medians": [],
    "samples_file": "scene.fill.alpha.x4.frames.csv",
    "correctness": { "reference": "golden id", "metric": "max_delta|ssim|flip", "value": 0, "pixels_over": 0, "pass": true, "diff_png": "" },
    "issues": [{ "frame": 0, "region": [0,0,0,0], "kind": "gl_error|shader|diff|nan", "detail": "" }]
  }]
}
```

Keep raw per-frame samples in a side CSV (so statistics can be recomputed) and the summary in JSON; also emit a Perfetto/Chrome-trace JSON of one run per scene for visual diagnosis [Chrome trace format U: https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU].

## 9. Top 10 pitfalls that make GPU benchmarks wrong

1. Vsync quantisation: a 20 ms frame shows as 33 ms; reading only fps hides GPU headroom. Record both paced and uncapped/GPU time.
2. Measuring CPU submission time as GPU time: GL calls return before the GPU runs; without a fence, timer query or finish you time the driver queue.
3. `glFinish`/query per draw on a tiled GPU: serialises the pipeline, defeats tiling, and attributes nothing correctly; also inflates the total.
4. Ignoring `GPU_DISJOINT_EXT` and 0/garbage timer results (see Adreno 0-values [V]); validate and drop.
5. No warm-up: shader compilation, texture upload, atlas fill and driver lazy allocation land in the measured window.
6. Thermal throttling and DVFS: the first 30 s are faster than steady state; a run order effect looks like a regression. Interleave A/B and log clocks/temp.
7. Different power state or governor: battery vs plugged, power-save, background services, notification activity.
8. Averages and single runs: outliers and bimodality vanish; one run is not a distribution; no CI.
9. Compositor/swapchain buffering (triple buffering, BufferStuffing [V]) adds latency without missing frames, and the present timestamp is not the display time unless the platform guarantees it.
10. Scene not isolating one cost: text + shadow + blend in one scene tells you nothing; or the driver culls or optimises away invisible/unused work, or the framebuffer content differs between runs (dithering, non-determinism), so correctness checks pass vacuously.

## 10. Hardware with no GPU timer

Ranked fallbacks:
1. Fence/`glFinish` bracketing at frame granularity only: `t0; submit frame; glFinish(); t1` gives CPU+GPU frame time with the pipeline drained, so it is a serialised (slower) number; tag the source `finish_bracket`, compare only against other `finish_bracket` runs. Some drivers make `glFinish` a no-op or non-blocking; validate by checking that a deliberately heavy scene increases the measured time (a calibration scene).
2. Readback trick: `glReadPixels` of 1 pixel after the frame forces completion on all drivers (cost: a stall); same caveats [U, common practice].
3. Differential measurement: run scene S and scene S minus feature; the delta is the feature cost; all at the same pacing. Works on tilers where per-draw timing fails.
4. Uncapped throughput: draw the same frame K times per swap (or offscreen FBO, no swap) and divide, to escape vsync and amortise finish cost.
5. Platform frame stats instead: Android gfxinfo framestats / SurfaceFlinger latency [U], Metal command-buffer times, DRM page-flip timestamps, CADisplayLink, Perfetto FrameTimeline on 12+ [V].
6. Load counters: `vcgencmd measure_clock v3d`, Mesa `GALLIUM_HUD`, Tegra/Adreno sysfs GPU busy files (UNVERIFIED per device).
7. Software raster: CPU time is the whole cost; its numbers are exact.

Capability probe at startup: write `timer_source` into the artifact so the report states how the GPU number was obtained, and refuse to chart `finish_bracket` against `timer_query` on the same axis.

## Gaps (could not confirm, check before relying)

EXT_disjoint_timer_query on Tegra 3, VideoCore IV, TouchPad Adreno; A9X Metal counter-sampling points; MotionMark scoring details; Flutter exact JSON keys; Perfherder JSON; Skia Gold fuzzy matching; webOS tooling.
