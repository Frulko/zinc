# zinc:canvas — HTML Canvas 2D

`plugins/canvas2d` (module `zinc:canvas`) is a `CanvasRenderingContext2D` for Zinc programs, so web canvas code ports
with few changes. Paths are flattened and transformed in Zinc (`plugins/canvas2d/index.ts`), strokes become filled
outlines (caps, joins, miter limit, dashes), and fills go to the shared rasterizer as anti-aliased polygons with the
nonzero or even-odd rule and an optional gradient paint (`native/canvas2d.host.cpp`). Text and images use `zinc:gfx`.
Everything is vector until the rasterizer, so HiDPI screens get crisp output without changes.

```tsx
import { render } from 'zinc:ui/solid';
import { CanvasRenderingContext2D } from 'zinc:canvas';

const ctx = new CanvasRenderingContext2D();
function Clock(x: i32, y: i32, w: i32, h: i32): void {
  ctx.begin(x, y, w, h);              // the <canvas> box: origin and clip
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.beginPath();
  ctx.arc(0, 0, Math.min(w, h) * 0.45, 0, 2 * Math.PI);
  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#333';
  ctx.stroke();
  ctx.restore();
  ctx.end();
}
render(() => <canvas class="grow" onDraw={Clock}></canvas>, 0x0f172a, null);
```

Outside `zinc:ui`, call `ctx.begin(0, 0, width(), height())` / `ctx.end()` inside `onFrame`.

Example: `examples/canvas/sketch` — the w3schools analog clock (radial-gradient rim, rotated numbers, round-capped
hands) ported almost line for line, fireworks with radial alpha glows and fading trails in an offscreen `Canvas`,
a bezier wave, an even-odd star with a dashed outline, the three line joins, a rounded label.

```sh
zinc run examples/canvas/sketch                 # macOS window (HiDPI)
zinc run examples/canvas/sketch --target sim    # Node (headless: the geometry runs, nothing is drawn)
```

## Drawing targets

| | |
| --- | --- |
| `new CanvasRenderingContext2D()` | draws into the current frame: `begin(x, y, w, h)` sets the origin and clips to the box (a `<canvas onDraw>` box or the screen), `end()` pops the clips. Frames are immediate: every frame redraws everything (web code that clears and redraws each frame ports as is) |
| `new Canvas(w, h)` + `canvas.getContext('2d')` | an offscreen canvas backed by a runtime image: `begin()` / `end()` render into its pixels, which persist between frames like a web canvas (trails, paint programs). Show it with `ctx.drawImage(canvas.image, ...)` or `gfx.drawImage`, or use it as a three.js `CanvasTexture` |

`ctx.canvas.width` / `height` give the box (or image) size.

## Supported API

| area | |
| --- | --- |
| state | `save`, `restore` (styles, line settings, dash, transform, clips); state persists across frames, like the web |
| transforms | `translate`, `rotate`, `scale`, `transform`, `setTransform(a, b, c, d, e, f)`, `resetTransform`, `getTransform` (a `DOMMatrix` with a–f) |
| paths | `beginPath`, `moveTo`, `lineTo`, `closePath`, `quadraticCurveTo`, `bezierCurveTo`, `arc` (with `anticlockwise`), `arcTo`, `ellipse` (rotation), `rect`, `roundRect(x, y, w, h, radius)` |
| fill | `fill('nonzero' \| 'evenodd')`, `fillRect` (one rectangle command when the transform is axis-aligned), `clearRect` |
| stroke | `stroke`, `strokeRect`, `lineWidth`, `lineCap` (butt, round, square), `lineJoin` (miter, round, bevel), `miterLimit`, `setLineDash`, `getLineDash`, `lineDashOffset` |
| styles | `fillStyle` / `strokeStyle` as CSS colours: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()` (commas or spaces, `/ alpha`, percentages), `hsl()`/`hsla()`, the 148 CSS names, `transparent`; `globalAlpha` |
| gradients | `createLinearGradient`, `createRadialGradient` (two circles, the web's cone rule), `addColorStop` with any number of stops and per-stop alpha; assigned with `fillGradient` / `strokeGradient` (below) |
| text | `fillText`, `strokeText`, `measureText` (`width`, bounding box ascent/descent), `font` (`[italic] [bold\|100–900] <n>px\|pt <family>`: `sans-serif`, `monospace`, or a TTF family from the assets), `textAlign` (start, left, center, right, end), `textBaseline` (alphabetic, top, hanging, middle, bottom, ideographic) |
| images | `drawImage(image, dx, dy)`, `(image, dx, dy, dw, dh)`, `(image, sx, sy, sw, sh, dx, dy, dw, dh)` with a `zinc:gfx` image id (baked asset `gfx.image('x.png')`, runtime image, `canvas.image`) |
| clipping | `clip()`: intersects with the **bounding box** of the current path (exact for rectangles) |
| hit testing | `isPointInPath(x, y, rule)`, `isPointInStroke(x, y)` (canvas pixels, like the web); `strokeContours()` returns the stroke outline |
| helpers | `parseColor(css)` → `CssColor` (`rgb` 0xRRGGBB, `alpha` 0..255) or null, also used by `three`'s `Color.setStyle` |

## Deviations from the web

- **Gradients**: `ctx.fillStyle = gradient` is spelled `ctx.fillGradient = gradient` (Zinc has no `string | object`
  unions). Assigning `fillStyle` (a string) clears `fillGradient`, as on the web. Text drawn with a gradient style uses
  its first stop's colour. Gradient colours are interpolated unpremultiplied; a skewed transform moves the gradient
  end points but not its perpendicular.
- **Clipping**: `clip()` clips to the path's bounding box (the rasterizer clips to rectangles). Rectangular clips
  are exact; round or diagonal clip paths are not.
- **Text** is drawn with baked/runtime glyphs at the transformed size and position but **not rotated or skewed**
  (the classic "rotate, translate, rotate back, fillText" idiom used for clock numbers works). `strokeText` fills the
  glyphs with the stroke style. `maxWidth` is ignored. Sizes written literally in a `font` string (`'bold 20px
  sans-serif'`) are baked at build time; computed sizes use the nearest baked size (runtime TrueType on hosts).
- **Images** are placed and scaled with the transform but not rotated or skewed; sampling is bilinear
  (`imageSmoothingEnabled = false`: nearest, for runtime images).
- `clearRect` paints `ctx.clearColor` (default `'transparent'`): nothing on screen, where each frame starts from the
  UI or the previous layers anyway, black in an offscreen canvas (runtime images have no alpha channel).
- Not implemented (accepted and ignored where they are properties): shadows (`shadowBlur`, `shadowColor`...),
  `globalCompositeOperation` other than source-over, patterns, `getImageData`/`putImageData`, `Path2D`, per-corner
  radii in `roundRect`.
- Curves are flattened for about a quarter pixel of error at the current scale; a very large later `scale()` of an
  already built path shows its segments (paths are transformed when built, like the web, but flattened once).

## Rasterizer change

Canvas gradients need more than the rasterizer's two-colour rectangle gradients, so a `POLY` command can carry a
gradient paint record after its contours (`grad = 4`: kind, the two points and radii, and `(offset, colour, alpha)`
stops; `runtime/raster.cpp` `paint_at`). The frame diff compares the record and HiDPI scaling scales its geometry.
The even-odd rule was already there (`pad` bit 0) but not exposed by `gfx.path`.

## Performance

`examples/canvas/sketch` at 720×540 on macOS (Retina: 1440×1080 rasterized), release build, Apple M1 Pro, average of
300 frames:

| | ms / frame |
| --- | --- |
| the three canvas callbacks (clock, fireworks with 30–120 particles, shapes strip): path building, flattening, stroking, command emission | 0.35–0.51 |
| rasterization of the frame (`runtime/gfx.cpp`, measured around the band renderer) | 12.8–13.2 |
| … without the fireworks panel / without the shapes strip / without the clock | 2.9 / 6.1 / 9.3 |

The Zinc side is cheap; the cost is the shared rasterizer covering ~1.5 M pixels per frame (the animated canvases'
damage rectangles merge into the whole screen): 4×4 supersampled polygons, per-pixel gradient paint, bilinear scaling
of the 320×360 offscreen canvas. `imageSmoothingEnabled = false` switches runtime images to nearest scaling. Static
canvases cost nothing: unchanged commands produce no damage.

## Targets

| target | status |
| --- | --- |
| macos | yes (screenshots checked) |
| sim | yes: the geometry runs, fills are no-ops (`tests/conformance/canvas2d.ts` prints the same bytes as macOS) |
| linux, rpi1, rmpp, wasm, esp32 | the plugin is portable C++ (`canvas2d.<target>.cpp` includes the host file); see the verification section for what was built |
| ps1, ps2 | not listed |

Memory: paths live in Zinc arrays while built; a fill copies its contours into the frame's point pool (floats), which
the plugin raises to 256 K floats on hosts (`ZRT_POINT_POOL`) like `zinc:lottie`. A stroke costs about one quad per
segment plus joins.
