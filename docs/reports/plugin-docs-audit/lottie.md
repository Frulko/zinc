# lottie documentation audit

## What it is
Lottie (Bodymovin JSON) animations played natively, no JS engine: a `<Lottie/>` UI node and a `Player` for spinners, icons, onboarding animations.

## Targets and status
`plugin.json`: macos, linux, windows, android, ios, rpi1, rmpp, wasm, ps2, esp32, plus a `web` entry using lottie-web (svg/canvas renderers). Doc table: macOS verified; wasm gallery in Chrome; rpi1 QEMU; esp32 runs the conformance test in QEMU but no display; ps2 builds only; android/ios/web entry not in the table.

## What the docs have
- [x] overview (`docs/plugins/lottie.md`, 144 lines)
- [ ] install/requirements
- [x] quick start (UI node and Player)
- [x] API reference (function list, `Player`, `<Lottie>` props) - matches `index.ts` closely
- [x] example code
- [x] runnable example `examples/ui/lottie-gallery` (12 animations); used by hero, rn-showcase
- [ ] screenshot: `docs/img/lottie-gallery.png` exists, unlinked
- [ ] tutorial
- [x] commands (bench, `LOTTIE=file.json` viewer)
- [~] notes: a thorough feature matrix; nothing on licences of sample files, how to export from After Effects (Bodymovin/LottieFiles), or file-size advice
- [x] tests: `svg_lottie`, `tests/conformance/lottie.ts`, `web_video`/`web-lottie` fixture

## What is missing
1. Link `docs/img/lottie-gallery.png`; add a GIF of the spinner (`ZINC_SHOT` frames at 0.5 s and 1.5 s).
2. A 5-step tutorial: get a JSON from LottieFiles, put it in `assets/`, show `<Lottie>`, control with `player`, switch to `cacheBg` for icons.
3. "Preparing your animation" page: what to avoid (expressions, mattes, image layers, dashes), how to check with the matrix.
4. Add android, ios, windows and the web path (lottie-web) to the Targets table.
5. Add a short "which of lottie / gsap / animation" pointer.
6. Troubleshooting: blank output (unsupported layer types), command budget on ESP32, 30 fps files on 60 Hz (`subframe`).
7. (hardware) esp32 display run (the doc says the HAL had no display).
8. (owner) the sample files in the gallery: record their licences.

## Wrong or stale
- Numbers measured "before the kit restyle (96 px cards)" - cards are now 112 px; refresh.
- "The esp32 HAL has no display yet": check against the current esp32 panels in `boards/`.
- Follow-ups mention rasterizer work (even-odd, dashes); the matrix says "even-odd drawn as nonzero": confirm still true after the paint-kind work (`ZN-261`).
- Matrix is mac-centred; the `web` entry (lottie-web) renders all features, say so.

## Suggested pages
- Lottie: overview and quick start
- API reference (generated)
- Supported features (matrix)
- Prepare your animation (export checklist)
- Performance and render-to-image mode
- Per-target notes (web, ESP32, PS2)
- Gallery with screenshots
