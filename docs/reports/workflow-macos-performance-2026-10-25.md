# macOS workflow measurements — 2026-10-25

Actual background windows on Apple M1 Pro, MacBookPro18,3, 10 physical cores, 16 GiB RAM, AC power. Three accepted finite passages per case: 330 callbacks, first 30 excluded from frame statistics. Separate live physical-footprint passages do not contribute timing statistics. All 44 accepted processes exited 0; no active compiler/build process was observed during an accepted passage. Other applications remained open: this is a development-machine baseline, not an isolated laboratory or sustained thermal test.

[Raw samples, commands, dimensions, revisions, hashes, rejected runs and failures](bench/workflow-macos-2026-10-25.json). Reported values are medians across the three per-run statistics; p99 is the median of three per-run p99 values, not a pooled percentile. CPU is user+system process time divided by parent launch-to-reap wall time, including startup and up to roughly 100 ms polling overshoot; 100% means one core. This approximation matters most for the short LibGodot passages. Peak RSS is a high-water mark. Physical footprint is one separate macOS `proc_pid_rusage` snapshot per case, not a peak, at 2 seconds after observed window (0.1 seconds for the short LibGodot runs).

## Results

| Case | Instrumented work p50 / p99 (ms) | Callback interval p50 (ms) | Process CPU (% of one core) | Peak RSS (MiB) | Physical snapshot (MiB) |
|---|---:|---:|---:|---:|---:|
| swift-idle | 0.030 / 0.065 | 16.668 | 2.7 | 130.3 | 66.6 |
| swift-active | 2.858 / 4.012 | 18.705 | 68.5 | 199.4 | 113.1 |
| libgodot-idle | 0.018 / 0.046 | 0.570 | 44.6 | 111.9 | 87.3 |
| libgodot-active | 0.026 / 0.077 | 0.666 | 39.5 | 112.4 | 86.6 |
| warehouse-idle | 0.035 / 0.068 | 8.275 | 21.5 | 188.9 | 117.5 |
| warehouse-active | 0.909 / 1.049 | 9.559 | 30.4 | 195.7 | 115.2 |
| animation-lab | 0.821 / 1.897 | 8.936 | 29.4 | 121.1 | 183.9 |
| lantern-post | 0.921 / 1.693 | 8.926 | 32.5 | 124.3 | 187.7 |
| blender-world | 0.746 / 1.330 | 8.953 | 27.8 | 120.4 | 183.6 |
| blender-library | 0.003 / 0.008 | 9.026 | 6.3 | 101.4 | 159.3 |
| godot-to-zinc | 0.001 / 0.002 | 10.021 | 5.4 | 99.3 | 157.7 |

## What each boundary measures

- Swift: AOT Zinc UI in SwiftUI/NSView. Work is tick plus RGBA copy, excluding the full Cocoa draw/presentation. Idle stops UI animation; active runs the ordinary animation.
- LibGodot: AOT Zinc navigation inside the real minimal 2D Godot 4.6 host. Table work covers only Zinc tick/presentation submission. Raw `godot_iteration_us` records the separate Godot iteration. Idle pauses the game. The host is unpaced and the active observation is very short; callback cadence is unstable and must not be called displayed FPS or used to rank engines.
- Warehouse: real Godot 4.6 3D scene with Zinc AOT UI through GDExtension. Work is the Zinc step, RGBA conversion and texture-upload submission. Idle performs zero UI uploads after warmup; active changes inventory every callback and performs 300 uploads. The 3D scene continues animating in both modes. Godot `process_us` is its previous-frame monitor, not total process CPU.
- Five standalone scenes: default `zinc run` interpreter with frontend/runtime in the same process, 960×640 logical window, `ZINC_3D=gpu`, vsync requested. The profiler's `work` covers instrumented runtime rendering phases, not a separately isolated whole animation/skinning update or all application CPU. Its `renderer: cpu` names the 2D compositor; it does not negate the selected native 3D GPU path. Blender Library and Parcel Yard are mostly static and skip redraws: their tiny work figures prove idle behavior, not game FPS.

Different workloads, resolutions, host loops and instrumented boundaries make these integration baselines, not a fair head-to-head renderer benchmark. Native surface/window sizes are preserved in raw host/CGWindow records. GPU completion time and actual displayed refresh rate were not measured.

## Startup and variability

Parent-observed readiness includes launch, with roughly 100 ms polling granularity. Native uses its flushed first-ready marker; standalone uses the observed visible window, which does not prove the first image was fully presented. Host-internal `first_ready_us` has different starting boundaries and is preserved separately.

| Case | Parent-observed readiness median (ms) | Range of per-run median callback interval (ms) | Peak RSS range (MiB) |
|---|---:|---:|---:|
| swift-idle | 227 | 16.665–16.674 | 130.0–130.8 |
| swift-active | 225 | 17.220–19.714 | 195.1–207.8 |
| libgodot-idle | 820 | 0.553–6.898 | 111.4–112.5 |
| libgodot-active | 587 | 0.576–6.901 | 104.5–113.1 |
| warehouse-idle | 1525 | 6.390–10.517 | 185.2–193.4 |
| warehouse-active | 825 | 8.833–10.676 | 194.6–196.0 |
| animation-lab | 342 | 8.605–8.940 | 120.8–121.6 |
| lantern-post | 438 | 8.913–8.930 | 124.0–124.5 |
| blender-world | 443 | 8.912–8.953 | 120.2–120.7 |
| blender-library | 346 | 8.372–9.030 | 99.9–101.4 |
| godot-to-zinc | 334 | 8.742–10.029 | 99.2–99.3 |

LibGodot iteration (separate from Zinc UI work):

- libgodot-idle: p50 0.544 ms, p99 2.579 ms.
- libgodot-active: p50 0.622 ms, p99 5.233 ms.

## Reproduction and exclusions

Prepare the native examples using their READMEs, then run `GODOT=/path/to/Godot tools/bench-workflows-macos --out /tmp/workflow.json`. The runner waits for build-free gaps, rejects passages if another build appears, runs cases sequentially, checks that actual windows exist without taking focus, and cleans up its children. `tests/run --only workflow_bench` validates parsing, quantiles, sample counts, build detection and the live physical-footprint binding.

Warmup means 30 excluded callbacks, not a guarantee of identical launch cache state. An optional repeat of the already accepted Parcel Yard passage was cancelled while waiting for unrelated builds; its original uncontaminated 300-sample passage is retained.

Standalone final measurements use the detached revision and binary/library hashes in `fixed_checkout`; earlier live-tree measurements and first cache-compiling launches remain in superseded sections. Native probes use the same copied binaries throughout. Earlier cross-clock window timestamps were invalid and are explicitly excluded; native readiness markers remain valid. Failed intrusive memory experiments are retained under failures/superseded memory passes; final memory uses the live non-suspending kernel counter. Contaminated passages remain under `rejected` and are excluded from this table.

No benchmarked application crashed in the 44 accepted final passages. An optional Godot editor import previously crashed in extension documentation cleanup; ordinary finite game/benchmark teardown passes. That editor issue is still open. No sustained large-world, worst-case animation crowd, GPU-completion, energy, displayed-FPS, mobile or console claim follows from these small macOS fixtures.
