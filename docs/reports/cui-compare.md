# CUI and Zinc tracker comparison

The harness builds and starts both trackers. **There is no performance ranking yet.** The M1 Pro artifact sizes below are real; quiet-machine runtime measurements on the M1 Pro and Raspberry Pi 3B+ remain the owner's. ZN-1078.29 remains in Review.

| Machine / app | Native executable bytes | Frame build/layout/paint | Native-window RSS | Idle CPU |
|---|---:|---|---|---|
| M1 Pro / CUI tracker | 430,904 | unmeasured | unmeasured | unmeasured |
| M1 Pro / Zinc tracker AOT | 7,017,392 | unmeasured | unmeasured | unmeasured |
| Pi 3B+ / both | unmeasured | unmeasured | unmeasured | unmeasured |

These are the linked, unstripped executable files, not bundles, compressed downloads, shared OS libraries or a sum of every dependency. CUI's separately built offscreen timing driver is 456,304 bytes; it is excluded from the native-app size column. Comparing these results to a generic “170 KB CUI” claim would be misleading.

## Reproduce

Requires Python 3.9+, CMake, a C compiler and a working Zinc compiler/runtime installation. On Linux the pinned reference's normal X11 backend also needs X11 development headers/libraries. Nothing is installed or deployed by this tool. Use a fresh output directory for every build; downloaded source stays there, outside the repository.

```sh
# Native build on the machine being measured. A build never starts a benchmark.
ZINC="$PWD/build/zinc" timeout 1300 tools/cui-compare build --out /tmp/cui-tracker-mac
# Read bytes/build provenance without launching any app.
tools/cui-compare show --out /tmp/cui-tracker-mac

# Owner-selected quiet-machine pass, one foreground command, no other jobs.
# Default: 120 offscreen frames, first 30 excluded; then optional real background windows.
timeout 360 tools/cui-compare run --out /tmp/cui-tracker-mac --window-idle
```

Use the same commands on the Pi itself with `/tmp/cui-tracker-pi` and its native `ZINC` path. The known machine is `spark@192.168.2.31`; this harness does not silently SSH, cross-build, install packages or select a display. Run the window pass in its real desktop/display session, with `DISPLAY` and authentication already configured. There is no emulator fallback. MacBookPro18,3 is the M1 Pro machine used for the build proof.

`--frames`, `--skip`, `--warmup` (default 3 seconds) and `--seconds` (default 10 seconds) name the measured work. Counts are bounded to 4096 frames and each idle warmup/sample interval to 30 seconds; frame commands have a 120-second deadline. Process groups are killed and reaped on completion/error/timeout, including compiler children. Only one app runs at a time. Builds use one CUI compiler job; a coordinator must also wrap builds/proofs in `tools/work-run` while other workers exist.

`build.json` records source revision/dirty state, source digest, compiler executable digest, reference pin/archive digest, driver digest, font file digests, executable digests/bytes and build wall seconds. CMake's cache and compile commands preserve its compiler/flags. Raw `configure.log`, `build-*.log`, `frame-*.log` and optional `idle-*.log` remain beside it. Every successful measurement saves a dated `run-*.json` plus the latest `run.json`. `show` prints unavailable for missing values; a missing profile, incorrect surface, incomplete frames or changed executable fails the run.

## What the numbers mean

- **Compile/build wall seconds** cover a native CUI Release library/app/driver build or Zinc's tracker AOT build. CUI configuration/download is excluded. Zinc uses an existing compiler and runtime libraries; its resource/native caches may already be warm. These seconds are not runtime UI build time and cannot rank clean compiler builds.
- **CUI frame work, microseconds:** the unchanged pinned `tracker.c` calls its original callback and initial state through a small public-API offscreen driver, following upstream's [benchmark pattern](https://github.com/yappologistic/CUI/blob/f70a1d3d095cafd67814b23bdd82c2dfba28efe0/tests/bench.c). Each measured interval brackets `cui_begin_frame`, the tracker callback and `cui_end_frame` (layout and draw-command production). A separate interval brackets software rasterization. It is not the Cocoa/X11 application event loop or window presentation time. Incremental software rendering is enabled. The driver takes each frame's two samples; the report uses their medians.
- **Zinc frame phases, microseconds:** the real AOT app runs headlessly with `ZINC_PROFILE=json`, `ZINC_RENDERER=cpu`, scale 1 and deterministic time. The existing `tools/zbench` parser reads the engine's `app`, `layout`, `paint` and `raster` phase p50s. `app` and CUI's callback bracket have different boundaries. Their medians are deliberately not added: the sum of phase medians is not a measured median of total frame work. No Zinc combined frame number is fabricated.
- **Window RSS, MiB:** median and peak of 200 ms `ps rss` samples of the actual native app after warmup, divided by 1024. These are resident pages of that process, including shared pages in full. They exclude children, the compositor and GPU allocations; this is not PSS or macOS physical footprint.
- **Idle CPU, percent of one core:** the app's cumulative CPU time after warmup is subtracted from its time after the sample interval and divided by observed elapsed wall time. Linux uses `/proc/PID/stat` ticks; macOS uses `ps time` (centisecond resolution). It is not the lifetime-averaged `%cpu` field. Native event loops retain their own sleeping/redraw behavior. The resource sampler's cost is outside the app but can still perturb the machine.

The optional native pass leaves `ZINC_HEADLESS` unset and uses Zinc's background mode. Only the cached reference window backends are patched: Cocoa uses accessory activation policy (no Dock icon) and orders its window behind without activating the app; X11 sets a false input hint before mapping. The pinned tracker source remains byte-for-byte unchanged. These focus patches and window resource sampling have not yet been exercised in a real native-window pass; verify the foreground app remains unchanged before accepting measurements.

## What is and is not matched

Both startup pictures were inspected at **1440 × 900 physical pixels, scale 1, dark, neutral accent, initial state, no input**, with software rasterization. CUI is its pinned Orbit tracker; Zinc is `examples/ui/tracker` (Fieldwork). They have the same sidebar/list/detail screen family, but different text, issue counts, visible controls, geometry and editing behavior. CUI uses embedded Inter/Geist/Lucide; Zinc uses its own baked Inter/icon resources. Their Inter-Regular font files have different SHA-256 digests, and their medium/bold choices differ. This is **not identical text/layout work**. Nothing in the harness presents the offscreen driver as native-window painting.

Before comparing native idle results, record OS/compiler, power mode, governor/temperature on Pi, display/backend, actual backing scale/surface, focus/occlusion and screenshots for both apps. Native backing scale can differ from the offscreen scale-1 pass. Background windows may be occluded; Zinc's occlusion policy is part of that workload. A display/scale/font/content mismatch means no speed ratio. Repeat quiet runs in alternating order, retaining the dated artifacts, and publish median and spread; a single pass is a diagnostic sample, not a confidence claim.

For a strict speed comparison, first make the visible content, initial selection, viewport, fonts and exercised updates identical without replacing the reference tracker callback. Then choose common phase boundaries or publish independent phases. No such matched workload has been proved in this task.

## Build and startup evidence (2026-11-10)

- Base Zinc source `f2c6e74b04ef50e56191c44b10375e82ec56effb`; clean engine/library/tracker sources. Frozen common compiler SHA-256 `47a238519a706c385c312611ea9c17487944861e4bd660c012fe6ef643881764`; no engine rebuild.
- CUI [source pin](https://github.com/yappologistic/CUI/tree/f70a1d3d095cafd67814b23bdd82c2dfba28efe0), code [MIT licence](https://github.com/yappologistic/CUI/blob/f70a1d3d095cafd67814b23bdd82c2dfba28efe0/LICENSE); upstream [third-party notices](https://github.com/yappologistic/CUI/blob/f70a1d3d095cafd67814b23bdd82c2dfba28efe0/THIRD_PARTY.md) cover its included assets/libraries. Download archive SHA-256 `142cca2f01cbd3ddea9454739382cb6f4918fb177b6b444187e6a552391c5f00`; tracker source digest `697c5a56e93870d5fab4d30580a73e9b625998cd121753e58bced4809b6c541f`.
- Apple M1 Pro / macOS 15.7.4 / arm64: native CUI tracker and offscreen driver compile/link, Zinc tracker AOT compile/link, and two offscreen frames of each pass. No window opens. Inspected `cui-startup.png` and `zinc-startup.png` confirm different actual screens at the requested surface.
- Local artifacts: `/tmp/zinc-cui-compare-1078-29-final-proof/`. Native CUI SHA-256 `e84bbd77c80e5a83fe1a85e83ba4c896dc4d0e6a553ad8bda2c2b315176e7b49`; Zinc SHA-256 `8deb539b913cfacd4b049aae168e7492011f02b6d15c09dd18a8da0ca5ce0fb3`. Copy these transient files before reboot if they are needed later.
- Build wall seconds were 13.750 CUI and 2.042 Zinc on a busy host with warm caches; retained solely as harness provenance, **not** a compiler performance comparison. Incidental timing output of the two-frame startup was not used as a benchmark.
- Exact T0 `tests/run --only cui_compare` passes parser/provenance/unavailable-value and timeout cleanup checks without timing thresholds, compiling apps or launching a UI. No runtime benchmark, native-window measurement, Pi run, suite or CI was started.

Zinc should investigate the larger linked artifact by accounting for retained runtime/font/icon sections before changing a size budget; these bytes alone do not identify the cause. It should also preserve independent layout, draw-command and raster timings when comparing immediate and retained UI systems. The current evidence supports those next measurements, not a claim about which tracker is faster or uses less memory.

## Proposed tests

- `timeout 360 tools/cui-compare run --out /tmp/cui-tracker-mac --window-idle`: owner-selected M1 Pro frame/resource diagnostic, screenshots/foreground verification, about 30 seconds, expected under 500 MiB per app (not measured).
- Same command against a native build on the Pi 3B+ desktop: actual ARM/Linux frame/resource diagnostic, about 30 seconds to 4 minutes, memory not yet measured.
- Eleven alternating-order quiet runs with matched content/font/backing scale and native foreground checks: median/spread plus honest phase comparison, about 6 minutes, memory not yet measured. Acceptance criteria remain open until suitable numbers and their interpretation exist.
