# gsap documentation audit

## What it is
GSAP's core in typed Zinc (`import gsap from 'gsap'`): tweens, timelines, eases, staggers, labels, utils, for animating numbers in native programs. The real GSAP also runs on the QuickJS engine.

## Targets and status
`plugin.json`: macos, linux, android, ios, windows, rpi1, rmpp, webos, wasm, esp32 (pure Zinc, deterministic). The doc says "every target the language reaches" without a per-target table. D123 in `backlog/later.md`: Android targets need listing (now present in plugin.json; check the line).

## What the docs have
- [x] overview with the two paths (typed port vs real library), `docs/plugins/gsap.md`, 72 lines
- [~] install: import line only; the real library download is documented (`tools/test-lib gsap-3.15.0`)
- [x] quick start
- [~] API reference: a prose list, no table of signatures; matches `index.ts` (to/from/fromTo/set/timeline/delayedCall/killTweensOf/getTweensOf/defaults/registerEase/parseEase/ticker/utils)
- [x] example code
- [~] runnable example: only `examples/js-gsap` (the real library); `examples/music` uses the typed port but is not named
- [~] screenshot: `examples/js-gsap/screenshot.png` exists, not shown on the page
- [ ] tutorial
- [x] commands
- [x] notes: differences and why (callbacks, ease registry, own clock, numbers only)
- [x] tests: `gsap`, `example_js_gsap`, `plugins/gsap/tests/gsap_core.ts`

## What is missing
1. A typed-port example in `examples/` that draws a timeline on screen (a ball with ease, a staggered row) with a screenshot or GIF; today only the real library has one.
2. Screenshot of `examples/js-gsap` embedded in the page.
3. A 5-step tutorial: tween a value, draw it each frame, chain a timeline, add labels and position parameters, stagger a grid.
4. An ease cheat sheet: a generated page plotting each ease curve (SVG), the best visual item for this plugin.
5. API table with signatures and the "not supported" list (colors, SVG paths, DOM, plugins) in one place.
6. Link from lottie/animation pages ("which animation tool").
7. Mention how `examples/music` drives it (`notify.ts`, `faces.ts`).
8. Troubleshooting: nothing moves (forgot `ticker.tick(dt)`), units like `px` dropped.

## Wrong or stale
- No contradiction found with `index.ts`. The page says `build/zinc`; the rest of the docs use `zinc`.
- "a canvas 2d" in the js-gsap sentence: grammar only.
- The page does not state a licence note for the typed port (it is a reimplementation; the real library's licence is described).

## Suggested pages
- GSAP in Zinc: two ways
- Quick start (tween and timeline)
- API reference (generated)
- Eases (interactive/plotted gallery)
- Timelines, labels and position parameters
- Using the real GSAP on QuickJS
- Differences from GSAP
- Examples
