# zinc:svg — runtime SVG rendering

`plugins/svg` parses an SVG document **once** (C++) into a display list of flattened contours in document units, then
draws it at any position and size through the shared anti-aliased vector rasterizer (`runtime/raster.cpp`: nonzero or
even-odd polygon fill, stroke outlines). Drawing only transforms points and builds stroke outlines; no re-parsing.

```ts
import { Svg } from 'zinc:svg';
import { readText } from 'zinc:fs';   // or a string constant, or zinc:assets

const logo = new Svg(readText('logo.svg'));
if (!logo.ok) console.error(logo.error);
onFrame(() => { clear(0xffffff); logo.draw(20, 20, 200, 200 * logo.height / logo.width, 255); });
```

API: `new Svg(text)`, `ok`, `error`, `width`, `height` (intrinsic size), `draw(x, y, w, h, alpha)` (honours
`preserveAspectRatio`), `items()`, `dispose()`. Example: `examples/maps/svg-gallery` (five documents at three sizes and
one zooming continuously).

## Support matrix

| Feature | Status |
| --- | --- |
| `path`: M L H V C S Q T A Z, absolute and relative, implicit repeats, packed numbers (`1.5.5`, `-1-2`) and arc flags (`a1 1 0 01 10 10`) | yes (curves and arcs flattened for ~512 px renderings) |
| `rect` (rx/ry), `circle`, `ellipse`, `line`, `polyline`, `polygon` | yes |
| `g`, nested `svg` (x/y), `a`, `switch`, `defs`, `use` (href / xlink:href, x/y), `symbol` via `use` | yes (`use` depth ≤ 8) |
| `transform`: matrix, translate, scale, rotate (with centre), skewX, skewY | yes |
| `viewBox`, `width`/`height`, `preserveAspectRatio` (align + meet/slice/none) | yes |
| fill, stroke, stroke-width, fill-opacity, stroke-opacity, opacity, fill-rule (nonzero/evenodd), color/currentColor, display, visibility | yes |
| presentation attributes, `style="..."`, `<style>` rules with `tag`, `.class`, `#id`, `tag.class`, `*`, selector lists | yes (cascade: attributes < rules in order < style attribute; no specificity, no combinators) |
| colors: `#rgb`, `#rrggbb`, `rgb()` (incl. %), ~60 common names, `none` | yes |
| `stroke-dasharray` | yes (no dash offset) |
| `linearGradient`, `radialGradient` (stops, href inheritance, gradientUnits) | approximated: first and last stop, vertical/horizontal along the dominant axis of the gradient vector, radial from the shape's box centre |
| stroke-linejoin / linecap | round only |
| group opacity | multiplied into the children (overlaps inside a group are not composited as one layer) |
| `text`, `image`, `clipPath`, `mask`, `pattern`, `filter`, `marker`, CSS `@media`/specificity, `%` lengths (except root size), units other than px, animation (SMIL) | no (elements skipped) |

## Targets

| target | status |
| --- | --- |
| macos, linux | yes (verified on macOS: gallery screenshots) |
| rpi1 | yes (docker build, runs under QEMU arm1176, same pixels) |
| wasm | builds (not run in a browser) |
| esp32 | not enabled yet: the code is portable (no STL, default 32k-float point pool fits tiny SVGs), but any zinc:gfx program currently fails to build for esp32 with ESP-IDF 6 (`-Werror=misleading-indentation` on existing lines of `runtime/gfx.cpp` / `runtime/raster.cpp`) |

Point budget (the plugin raises `ZRT_POINT_POOL` to 256k floats): each drawn frame copies the transformed contours into the frame's point pool; strokes cost more (a quad
per segment plus round joins where the path turns). Very large documents may drop shapes when the pool is full.

## Build-time SVG (assets)

Images in a project's assets directory are still baked at build time by `compiler/src/resources.ts` (a smaller subset:
no strokes, gradients, arcs or CSS). Use `zinc:svg` when the SVG must scale, change, or needs those features.
