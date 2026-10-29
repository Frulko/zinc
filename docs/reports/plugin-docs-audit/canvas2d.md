# canvas2d documentation audit

## What it is
An HTML Canvas 2D-style context (`zinc:canvas`) for Zinc programs: paths, strokes, gradients, text, images, transforms, offscreen canvases. Web canvas code ports almost line for line.

## Targets and status
`plugin.json`: macos, linux, windows, rpi1, rmpp, wasm, esp32, and a `web` entry (needs canvas2d). Doc: macOS and wasm verified (headless Chrome), rpi1 under QEMU, linux/rmpp/esp32 "listed, not built here"; ps1/ps2 not listed.

## What the docs have
- [x] overview (`docs/plugins/canvas2d.md`, 153 lines)
- [~] install: no line on how the module is added (it is implicit with the import)
- [x] quick start (UI `<Canvas onDraw>` and full-window forms)
- [x] API reference: a good table by area, deviations section
- [x] example code
- [x] runnable example `examples/canvas/sketch`, template `templates/canvas`, lessons `docs/learn/17-20` with screenshots in `docs/learn/img`
- [ ] screenshot of the sketch example on this page
- [~] tutorial: the learn lessons 17 to 20 cover it, the plugin page does not link them all
- [x] commands
- [~] notes: deviations are clear; nothing about the `web` implementation (a real canvas, so no deviations there)
- [x] tests: `canvas`, `webenv_canvas*`, `tests/conformance/canvas2d.ts`, `image_rect`

## What is missing
1. A screenshot of `examples/canvas/sketch` (`ZINC_SHOT=docs/img/canvas-sketch.png zinc run examples/canvas/sketch`) and one per panel (clock, fireworks, shapes).
2. A "Port a canvas sketch" tutorial: paste a w3schools clock, list the changes (`fillGradient`, `begin/end`).
3. Links from the page to lessons 17 to 20 and the `canvas` template (`zinc new --template canvas`).
4. A "Web target" paragraph: on the web build the plugin is the browser's own context.
5. Document `Canvas.image` use and the `CanvasSize` type; list `DOMMatrix`, `TextMetrics`, `CssColor` in the API table.
6. Backlog items to mention as known limits: conic gradients (ZN-261), per-frame bitmap read back (ZN-570).
7. Troubleshooting: fills disappear when the point pool is full (`ZRT_POINT_POOL`), a stroked curve looks segmented after a large `scale`.
8. (hardware) one esp32 or rmpp frame with a canvas drawing.

## Wrong or stale
- "Not implemented ... shadows (`shadowBlur`...), `globalCompositeOperation`" - properties exist (lines 181-182 of `index.ts`); the text says they are accepted and ignored, consistent, but verify the later claim against ZN-572 work (patterns, CSS filter, shadow under blend mode appear in `backlog/later.md`, so some are now implemented in the JS engine web path only).
- "`ctx.fillStyle = gradient` is spelled `ctx.fillGradient`": still true in `index.ts`; keep.
- Performance numbers (12.8 ms rasterization) predate the GPU renderer; re-measure.
- The example in the guide uses `<Canvas className=...>`: correct (capitalised, className).

## Suggested pages
- Canvas 2D: overview
- Quick start (in a UI and full window)
- API reference (generated)
- Differences from the web
- Offscreen canvases and textures
- Porting canvas code (tutorial)
- Performance and the point pool
- Examples with screenshots
