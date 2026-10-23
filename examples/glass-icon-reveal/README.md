# Glass / Zinc

A native Zinc adaptation of **[Glass Icon Reveal](https://github.com/zanwei/glass-icon-reveal)** by **[Zanwei Guo](https://github.com/zanwei)**, released under the MIT licence. Read the **[original documentation](https://github.com/zanwei/glass-icon-reveal#readme)** for the optical model, the original controls and the author's explanation; the [original live demo](https://zanwei.github.io/glass-icon-reveal/) shows the browser version.

The shader and critically damped spring are adapted from upstream commit [`ac9e6fac240686ebd84861634bc4f8ec30556a3c`](https://github.com/zanwei/glass-icon-reveal/tree/ac9e6fac240686ebd84861634bc4f8ec30556a3c). Copyright (c) 2026 Zanwei Guo. The full original notice is preserved in [LICENSE.upstream](LICENSE.upstream) and the adapted shader carries its attribution.

This version keeps the growing droplet, squircle tile, edge refraction, spectral corner focusing and dissolving glass. It uses an analytic Zinc Z instead of the original logo texture and twelve wavelength samples instead of twenty. It runs through `zinc:gfx` and `zinc:stage`, without a browser, WebGL context, network request or extra dependency. Logo upload, the full optics inspector, recording and browser persistence are outside this demo.

## Run on Mac

From the Zinc repository root:

```sh
build/zinc run examples/glass-icon-reveal
```

The manifest selects the GPU display and renderer on macOS and Linux. Agent captures use `ZINC_BACKGROUND=1`. A software-only display shows a labelled motion preview without optical refraction.

Tap the stage or **Replay** to restart. Drag horizontally to scrub, or drag the timeline to seek. **Play/Pause** controls playback; **Dark/Light** changes the look. Keyboard: **Space** plays/pauses, **R** or **Enter** replays, **D** switches theme, and **Left/Right** steps one frame. Playback stops after three seconds and retains its last frame. The layout adapts to portrait and landscape, with 44 px buttons.

## Android

```sh
build/zinc export examples/glass-icon-reveal --target android --apk --release -o examples/glass-icon-reveal/dist/android
adb install -r examples/glass-icon-reveal/dist/android/app/build/outputs/apk/release/app-release.apk
```

Requires the Android toolchain described in [the Android guide](../../docs/targets/android.md). The Android GPU layer draws the same GLSL ES 1.00 fragment program; its requested shading scale is 2. No desktop display plugin is selected on Android. The app id is `dev.zinc.glass-icon-reveal`; both orientations are allowed.

## Raspberry Pi

On a Pi with Zinc and the GPU display dependencies installed (Mesa EGL/GLES, GBM and DRM), run from the copied repository/project:

```sh
zinc run examples/glass-icon-reveal
```

Or, from the workstation to an already paired Pi:

```sh
build/zinc device <paired-pi-name> deploy examples/glass-icon-reveal
```

The manifest explicitly selects `gl` on Linux, so the Pi keeps the GPU path rather than the framebuffer-only preview. KMS/DRM needs access to the display and input devices; use the managed Zinc session on the Pi image. See [device deployment](../../docs/reports/zinc-next-agent.md) and [Linux targets](../../docs/targets/linux.md).

## Source and checks

- `src/main.ts`: scene assembly, keyboard and resize handling.
- `src/state.ts`: playback, theme and upstream spring curve.
- `src/components/Reveal.ts`: retained scene, controls and shader uniforms.
- `src/shader.ts`: attributed GLSL adaptation with an analytic logo.

```sh
tests/run --only glass_icon_reveal
tests/run --tier demo --only glass_icon_reveal_gpu
```

The headless test checks timeline bounds, mouse and touch replay/scrub, light/dark preview goldens, portrait/landscape smoke runs, interpreter/AOT/QuickJS agreement and 300 retained idle frames. The separate GPU test freezes the actual scene in each theme, captures three sizes and checks the warm/cyan spectral edges. It uses a fixture because the display-gl driver does not replay `ZINC_INPUT` events.

Verified on the development Mac: type check, those headless checks, and real GPU captures at 900×720, 360×640 and 800×480. **Android APK builds, physical Android/Pi runs, GPU-driver compatibility and device performance remain unverified.** A headless preview is not proof of the optical effect on a device.
