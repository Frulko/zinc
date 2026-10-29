# svg documentation audit

## What it is
Runtime SVG rendering (`zinc:svg`): parse an SVG once, draw it at any size and position with anti-aliased vector output. For logos, icons, illustrations.

## Targets and status
`plugin.json`: macos, linux, windows, android, ios, rpi1, wasm, plus a `web` entry (SvgEngine, needs canvas2d). Doc table lists only macos/linux, rpi1, wasm, esp32 ("not enabled yet"); android, ios, windows and the web entry are missing. Backlog: D123 (Android in targets), ZN-844 (stroked icons in the iOS export), ZN-820 (app icons).

## What the docs have
- [x] overview (`docs/plugins/svg.md`, 53 lines)
- [ ] install/requirements
- [x] quick start (6 lines)
- [~] API reference: one line listing `Svg` members; matches `plugins/svg/index.ts` (ok, error, width, height, draw, items, dispose)
- [x] example code
- [x] runnable example `examples/maps/svg-gallery`; also used by carnet, music, museum-table
- [ ] screenshots: `docs/img/svg-gallery.png` exists, not linked
- [ ] tutorial
- [~] commands: none on the page
- [~] notes: the support matrix is excellent; no note on SVG icons in `zinc:ui` (`Icon`) vs this plugin
- [~] tests: `svg_lottie` (T1) and `icons`; no test named in the doc

## What is missing
1. Screenshot: link `docs/img/svg-gallery.png` and add `ZINC_SHOT=... zinc run examples/maps/svg-gallery`.
2. A 5-step tutorial: load a logo, size it to the window, tint with `currentColor`, animate a transform, ship it as an app icon.
3. Fix the Targets table (see above) and add the web path.
4. Explain how SVG assets flow: `zinc:svg` runtime, build-time baking of assets, `zinc:ui` icons (Lucide), app icon in `zinc export` (ZN-844).
5. Typed `draw` signature in the page and a note that `alpha` is 0..255.
6. Troubleshooting: shape dropped when the point pool is full, `ok` false with `error` text, unsupported elements are skipped silently (text, filters, masks).
7. List of unsupported features as a checklist for designers ("export text as outlines").
8. (owner) decide whether gradients get a real implementation (the matrix says approximated).

## Wrong or stale
- "Images ... still baked at build time by `compiler/src/resources.ts`": the `compiler/` prototype was removed (tag `prototype-final`); name the current asset importer (`src/res`, `docs/reports/zinc-next-assets.md`).
- "esp32: any zinc:gfx program currently fails to build for esp32 with ESP-IDF 6": check; `lottie` builds on esp32 with the same flags, so this is probably fixed.
- "linux ... verified on macOS": ok, but android/ios/windows listed in `plugin.json` are absent.
- "(not run in a browser)" for wasm, while the plugin now has a `web` implementation (`web/svg.js`).

## Suggested pages
- SVG: overview and quick start
- API reference (generated)
- Supported SVG features (matrix)
- Icons and app icons
- Make your SVG Zinc-friendly (export checklist)
- Per-target notes
- Example gallery with screenshots
