# zinc:lottie

Lottie (Bodymovin JSON) animations rendered natively, without a JavaScript engine: the file is parsed once in C++
into a compact scene, and each frame is evaluated, flattened and drawn through the shared software rasterizer
(`gfx.path` polygons, anti-aliased). Plugin: `plugins/lottie/` (module `zinc:lottie`).

```tsx
import { Lottie } from 'zinc:lottie';
// UI node (zinc:ui canvas), played on the UI engine clock
<Lottie src="spinner.json" loop autoplay class="w-24 h-24" />
```

```ts
import * as gfx from 'zinc:gfx';
import * as lottie from 'zinc:lottie';

const p = new lottie.Player(lottie.load('spinner.json'));  // asset name (embedded), else a file path
p.loop = true; p.play();
gfx.onFrame((dt) => { p.update(dt); gfx.clear(0); p.draw(0, 0, 200, 200); });
```

- functions: `load(name)`, `parse(json)` → handle (-1 on error), `width`, `height`, `frames`, `fps`, `duration`
  (s), `layers`, `draw(a, frame, x, y, w, h)` (frame 0 = first; the composition is fitted into the box, aspect
  ratio kept, centered and clipped), `free`, `drawMs()` (time spent in `Player.draw` since the last call).
- `Player(anim)`: `play`, `pause`, `stop`, `seek(frame)`, `segment(from, to)`, `update(dt)`, `draw(x, y, w, h)`,
  `shown()`; fields `frame`, `speed` (negative plays backwards), `loop`, `playing`, `alpha`, `subframe`
  (default false: whole frames at the file's rate, see performance), `from`/`to`.
  `cache(w, h, bg, maxBytes)` switches to render-to-image mode (below).
- `<Lottie>` props: `src`, `loop`, `autoplay`, `speed`, `class`, `subframe`, `cacheBg` (render-to-image mode on
  that background colour), `player` (callback receiving the `Player`, for play/pause from the app).

Examples: `examples/ui/lottie-gallery` (12 animations in a grid with a fps readout, click a card to pause it),
`src/view.ts` there (one file, full window: `LOTTIE=file.json [LOTTIE_FRAME=n]`), `src/bench.ts` there (numbers below).

## Supported features

| Lottie feature | status |
|---|---|
| composition size, frame rate, ip/op | yes |
| layers: shape (4), solid (1), null (3), precomp (0) | yes; precomps with st (offset), sr (stretch), tm (time remap), clipped to their w/h |
| image (2), text (5), audio, camera, 3D layers | no (skipped; 3D layers are drawn flat, rotation = r or rz) |
| layer in/out points, hidden (hd) | yes: layers outside their range are skipped before any evaluation |
| parenting | yes (any depth; parent opacity is not inherited, as in Lottie) |
| transform: anchor, position (also split x/y), scale, rotation, opacity | yes; skew (sk/sa) ignored |
| keyframes: linear, hold, cubic-bezier easing | yes (first-dimension easing for multi-dimensional values); old exports (`e` end values, no `a` flag) too |
| spatial bezier (to/ti) on positions | yes, parametrized by arc length |
| expressions | no (the static/keyframed value is used) |
| shapes: group, path, rect (rounded), ellipse, star, polygon | yes; star/polygon roundness (os/is) ignored; direction (d = 3) honoured |
| fill (color, opacity) | yes; even-odd fill rule drawn as nonzero |
| stroke: width, color, opacity, caps (butt/round/square), joins (miter + limit/round/bevel) | yes; dashes (d) not supported (drawn solid) |
| gradient fill/stroke | linear gradients along x or y on axis-aligned rects are drawn as real two-colour gradients (colours sampled at the rect edges); every other gradient is drawn flat with its average colour and opacity |
| trim paths (start, end, offset; simultaneous and individual modes) | yes |
| repeater (copies, offset, transform, start/end opacity, composite order) | yes (integer offsets); one repeater per group |
| masks | additive masks clip to their bounding box (exact for axis-aligned rectangles); subtract, intersect, inverted, feather: ignored |
| track mattes | no: the matte source layer is hidden, the matted layer drawn unmasked |
| merge paths, round corners, offset path, pucker/bloat, twist, zig-zag, layer effects, blend modes | no (ignored) |

Verified on macOS by screenshots of the gallery at 0.5 s, 1.5 s and of single files, compared with lottie-web 5.12
(SVG renderer) in Chrome at the same frames: all 12 gallery files match in shape, position, colour and timing
(differences: flat gradient on the ellipse of `shapes.json`, hairlines slightly fainter than Chrome's retina
rendering). Found on the way: lottie-web evaluates layer properties in composition time (a layer's `st` and `sr`
only shift/stretch a precomp's inner time); Zinc does the same.

## How it is fast

- **Parse once**: JSON → a temporary DOM → flat arrays (layers, shape items, transforms) with every animatable
  property either a static value or a keyframe table in one float pool. The DOM is freed after loading.
- **Evaluate only what is visible**: layers outside their in/out range, hidden layers, matte sources and nulls are
  skipped before any evaluation.
- **Per-layer command cache**: each top-level layer keeps the commands it emitted with their key (frame, box).
  A layer with no keyframes anywhere in its content, transform or parent chain is evaluated and flattened once; an
  animated layer only when its frame or the box changes. Redrawing the same frame (paused player, a 30 fps file on
  a 60 Hz loop with `subframe = false`) is a replay of stored commands (a few µs); the frame diff then finds nothing
  changed and the rasterizer does no work — an idle Lottie costs nothing to rasterize.
- **Device-space flattening**: beziers are transformed first, then flattened with a 0.25 px tolerance, so a small
  icon gets few segments and a full-screen one stays smooth.
- **Cheap strokes**: a stroke is one outline per polyline (left side, cap, right side, cap), 2 edges per vertex,
  with proper miter/round/bevel joins; sharp inner turns fall back to the rasterizer's quad + disc stroker.
- **Rasterizer-friendly output**: axis-aligned rects and solid layers become rounded-rect commands (row fills),
  and large paths with many edges are cut into 16-row bands (exact, no seams) so the scanline filler only walks the
  edges of each band.
- **Render-to-image mode** (`Player.cache(w, h, bg, maxBytes)`, `<Lottie cacheBg={...}>`): for small looping
  icons, each frame is rasterized once into a runtime image atlas (w × h·frames, opaque on `bg`) and then drawn
  as a 1:1 row copy. Memory: w·h·4 bytes per frame (a 48 px, 54-frame icon: 500 KiB); refused above `maxBytes`.

## Performance (macOS, M1 Pro, release build, `zinc run examples/ui/lottie-gallery/src/bench.ts`)

Every frame of each file rendered off screen at 256×256 (`gfx.beginImage`), ms per frame:
vector = evaluation + flattening + command emission, raster = rasterization, replay = redrawing an unchanged frame.

| file | frames | vector | raster | total | replay |
|---|---|---|---|---|---|
| spinner (trim, round caps) | 90 | 0.006 | 0.70 | 0.70 | 0.002 |
| shapes (rounded rect, star, polygon, gradients) | 60 | 0.004 | 0.52 | 0.52 | 0.001 |
| orbit (parenting, precomp, repeater, solid) | 60 | 0.010 | 0.81 | 0.82 | 0.004 |
| TwitterHeart (18 layers, trims) | 116 | 0.003 | 0.03 | 0.03 | < 0.001 |
| Watermelon | 563 | 0.007 | 0.42 | 0.42 | 0.001 |
| PinJump | 93 | 0.003 | 0.12 | 0.12 | 0.001 |
| LottieLogo1 (48 layers, trims) | 179 | 0.010 | 0.09 | 0.10 | 0.002 |
| IconTransitions | 158 | 0.005 | 0.28 | 0.29 | 0.001 |
| 9squares (18 large stroked circles, two-level parenting) | 176 | 0.059 | 1.41 | 1.46 | 0.012 |
| HamburgerArrow | 180 | 0.001 | 0.03 | 0.03 | < 0.001 |
| Switch (large fills) | 150 | 0.004 | 1.70 | 1.70 | 0.001 |
| skottie-trimpath-modes | 601 | 0.005 | 0.41 | 0.41 | 0.001 |
| LottieLogo1 at 512×512 | 179 | 0.012 | 0.26 | 0.28 | 0.002 |
| TwitterHeart at 64×64 | 116 | 0.002 | 0.003 | 0.005 | < 0.001 |
| skottie_sample_search at 48×48 | 54 | 0.002 | 0.019 | 0.021 | < 0.001 |
| same icon, render-to-image mode (atlas copy) | 54 | | | < 0.001 | |

Evaluation is in the µs range; the rasterizer dominates and scales with the covered area (big fills and long
strokes), not with the number of layers. Measured with the machine under load (other builds running); numbers
are CPU time on one core.

Whole programs (release, `ZINC_FIXED_DT=1/60`, 600 frames, `/usr/bin/time`, user CPU per frame):

| program | CPU/frame |
|---|---|
| `lottie-gallery` (860×400, 12 animations at 112 px, UI, fps readout, measured before the kit restyle (96 px cards); the damaged rectangle covers most of the window every frame) | 2.4 ms (60 fps, ~15 % of a 60 Hz frame) |
| `view.ts` 9squares full window (400×400 composition), playing | 1.3 ms |
| same, paused | 0.30 ms, vs 0.23 ms for the same program with nothing loaded: an idle animation costs ~0.07 ms (command replay and frame diff), nothing is rasterized |

## Support matrix

| target | status |
|---|---|
| macos | supported, verified (gallery, viewer, bench, conformance test) |
| wasm | builds; gallery verified in Chrome |
| rpi1 | builds and runs the conformance test under QEMU (arm1176), identical to the sim |
| linux, rmpp | portable C++, same code as macOS (no platform code); not built here |
| sim | metadata only (size, frames, fps, layers via `JSON.parse`); drawing is a no-op like the rest of the sim's gfx; Player logic is shared Zinc code |
| esp32 | builds (ESP-IDF 6.0, firmware 303 KiB) and runs the conformance test under Espressif's QEMU, including draw calls of a small animation; output identical to the sim. The esp32 HAL has no display yet, so nothing is shown. The plugin sets a 4 Ki-float point pool and relaxes two GCC warnings of `runtime/gfx.cpp`/`raster.cpp` (misleading indentation) that `-Werror` would otherwise reject: gfx had never been built for esp32 before. |
| ps2 | builds (ps2dev docker, 1.7 MiB ELF); not run (no emulator here) |

Command budgets: the frame holds at most `ZRT_MAX_DRAW_CMDS` commands and `ZRT_POINT_POOL` floats of polygon
points; the plugin raises the point pool to 256 Ki floats on hosts (128 Ki on rpi1/wasm) and lowers it to 4 Ki on
esp32 (with 256 commands there), so only small animations fit on esp32. Extra commands are dropped, not crashed on.

## Follow-ups

- Dashes, even-odd fill, mattes and non-rectangular masks need rasterizer support (a coverage mask or a
  per-command fill rule); gradients on arbitrary paths need a gradient paint mode for polygons.
- The scanline filler walks every edge of a command for each sub-scanline; an active-edge table in `raster.cpp`
  would help big, complex paths more than the banding done here.
- Per-group caching inside animated layers (static groups are re-flattened when a sibling animates).
