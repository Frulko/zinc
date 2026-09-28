# zinc:map — interactive vector maps

`plugins/map` renders OpenStreetMap data from **Mapbox Vector Tiles** (MVT, the OpenMapTiles schema served by
OpenFreeMap, MapTiler, Planetiler…) with a subset of the **MapLibre/Mapbox style spec**, fully native: no browser, no
GPU, no JavaScript engine. It is built for small machines (Raspberry Pi 1) first.

```ts
import { MapView } from 'zinc:map';
import { onFrame, clear, width, height } from 'zinc:gfx';

const map = new MapView({ tiles: 'tiles', url: '', cache: '', sourceMinZoom: 0, sourceMaxZoom: 14, style: '' });
map.setView(48.8566, 2.3522, 14);
onFrame((dt: number) => {
  map.update(dt, 0, 0, width(), height());   // gestures, inertia, animations, tile loading
  clear(0xf2efe9);
  map.draw(0, 0, width(), height());
});
```

Example app: `examples/maps/explorer` (place list, zoom buttons, scale bar, attribution).

## How it works (and why it is fast enough for a Pi 1)

- **Tile pyramid of images.** Each visible tile is rendered **once** by the C++ engine into a runtime image
  (`raster::dyn_create`, 512×512, MapLibre's tile size so style zoom stops mean the same thing) and kept in an LRU
  (`tiles` option, 24 by default = 24 MiB). Panning only blits cached images; at integer zoom a blit is a row
  `memcpy`. While moving (drag, inertia, animation) scaled tiles use nearest filtering; at rest the map settles on an
  integer zoom so tiles are sharp and 1:1.
- **Progressive rendering.** New tiles are rendered nearest-to-centre first within a per-frame budget (`budgetMs`,
  12 ms, at least one tile per frame); until then the nearest cached ancestor is shown scaled.
- **Decoding on demand, bounded memory.** Raw tile bytes live in an LRU (`dataMb`, 16 MiB). A tile is indexed
  (layers, keys, values, feature offsets) without decoding geometry; geometry is decoded straight into rasterizer
  contours for the style layers that match. All features of a style layer become **one** polygon command (one
  nonzero fill for fills, a union of stroke outlines for lines), which also avoids seams and double blending.
- **Overzoom.** Beyond the source max zoom (14 for OpenMapTiles) the deepest data tile is scaled and clipped. A tile
  that is missing (outside an offline region, 404) falls back to its parent data tile.
- **Labels** are placed on screen every frame (not baked in tiles): point features of `symbol` layers, greedy
  placement by priority (later style layers first, then the feature `rank`), box collision, 1 px halo.

Plugin options (`zinc.json` `plugins.map`): `tiles` (cached tile images), `dataMb` (raw tile budget), `budgetMs`.

## Tile sources

- **Offline directory** `z/x/y.pbf`, uncompressed. `plugins/map/tools/fetch-tiles.mjs` downloads a region from
  OpenFreeMap (no API key) politely (2 requests at a time, User-Agent, refuses > 400 tiles), un-gzips, and can drop
  layers the style does not use (`--drop poi,housenumber,...`: POIs are ~75 % of a dense z14 tile):
  ```sh
  node plugins/map/tools/fetch-tiles.mjs --bbox 2.22,48.80,2.47,48.92 --zoom 10-14 --out tiles \
    --drop poi,housenumber,aerodrome_label,mountain_peak,transportation_name
  ```
- **Online** (`url`): a `{z}/{x}/{y}` template or a TileJSON URL (`https://tiles.openfreemap.org/planet`), fetched with
  `zinc:net` (2 requests in flight) and written to `cache` as `z/x/y.pbf`. Lookup order: offline dir, cache, network.
- Not supported: `.mbtiles` (needs SQLite), gzip-compressed tile files (store them uncompressed; the fetch tool does).

## Style subset

| Supported | Notes |
| --- | --- |
| layer types `background`, `fill`, `line`, `symbol` | `fill-extrusion`, `raster`, `circle`, `heatmap`, `hillshade` are skipped |
| `source-layer`, `minzoom`, `maxzoom`, `layout.visibility` | one vector source |
| filters: `all any none ! == != < <= > >= in !in has !has`, `$type` | legacy syntax, plus `["get", k]`, `["geometry-type"]` and `match` with boolean outputs |
| `fill-color`, `fill-opacity`, `fill-outline-color` | |
| `line-color`, `line-width`, `line-opacity` | round joins/caps only; no `line-dasharray`, `line-gap-width`, `line-offset` |
| `text-field` (`"{name}"` templates, `["get", k]`), `text-size`, `text-font` (Bold → bold face), `text-color`, `text-halo-color`, `text-halo-width` | point features only; no icons, no line labels (road names), no text-transform |
| zoom functions: `{ "stops", "base" }`, `["interpolate", ["linear"/"exponential", b], ["zoom"], ...]`, `["step", ["zoom"], ...]` | numbers and colors (`#rgb #rrggbb #rrggbbaa rgb() rgba() hsl() hsla()`) |

Data-driven properties (other than filters), sprites, and 3D are not supported; unsupported filter expressions
pass (the feature is drawn). The bundled `DEFAULT_STYLE` (`plugins/map/style.ts`) is an OSM-Carto-like style for the
OpenMapTiles schema; pass your own JSON as `style`. Label glyphs come from the baked fonts (Inter): Latin and
Latin Extended-A are baked by the plugin (`LABEL_CHARS`); other scripts show `?`.

## Gestures (`zinc:gestures`)

`MapView.update` uses `plugins/gestures` (a small, general `Gestures` class): mouse drag with release velocity
(inertia), wheel (`wheelStep` per notch) and trackpad pinch zoom around the pointer, double-click / double-tap zoom in,
one-finger pan and two-finger pan + pinch zoom on touch screens (`rotate` is measured but the map does not rotate:
rotating cached tiles would cost a full re-render per frame on a Pi 1). Keyboard: arrows pan, Q/E zoom.

## Targets

| target | status |
| --- | --- |
| macos | yes (SDL window; verified: screenshots, benchmark below) |
| linux | yes (same code as macOS) |
| rpi1 | builds in docker (`--target rpi1`), runs headless under QEMU arm1176 (verified: screenshot + benchmark) |
| wasm, esp32 | no: offline tiles need `zinc:fs`, online needs `zinc:net` (not on wasm), and a 512² tile image is 1 MiB |

## Performance

Scripted benchmark: `ZINC_MAP_DEMO=1 ZINC_FIXED_DT=0.016667 zinc run examples/maps/explorer` (pan at 360 px/s,
zoom steps; frame time = full frame including tile rendering, labels and presentation).

| | macOS (M1 Pro, 960×600) | rpi1 binary under QEMU arm1176 on the same Mac (800×480, headless) |
| --- | --- | --- |
| dense central-Paris z14 tile (buildings, ~50k vertices) | 15–20 ms | ~180 ms |
| average tile (z12–z15) | 12–18 ms | 100–170 ms |
| frame while panning over cached tiles | 1.2–2.3 ms avg | 11–16 ms avg |
| worst frame (one tile rendered in the frame) | 26–32 ms | 140–340 ms |

A real Pi 1 (ARM1176 at 700 MHz, no NEON) is roughly 25–40× slower than an M1 core on this code: expect ~0.4–0.8 s
per dense z14 tile (shown progressively over its scaled parent) and ~25–40 ms frames when panning over cached tiles at
800×480 (a 1.5 MB blit plus labels per frame). Not measured on hardware yet.
