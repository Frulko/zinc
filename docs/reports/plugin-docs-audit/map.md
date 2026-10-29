# Audit: zinc:map (plugins/map)

## What it is
Interactive vector maps (OpenStreetMap data as Mapbox Vector Tiles, MapLibre style subset), drawn natively, fast enough for a Raspberry Pi 1; on the web it runs MapLibre GL JS behind the same `MapView`.

## Targets and status
plugin.json: macos, linux, windows, rpi1 + web (MapLibre 5.24, WebGL2). Doc: macos and linux verified (screenshots, benchmark), rpi1 under QEMU only (real Pi not measured). Tests: `map.sh`, `map_rows.sh`, `web_hw.sh` (web fixture). Windows unverified.

## What the docs have
- [x] docs/plugins/map.md (104 lines): overview, quick start, how it works, tile sources with the fetch tool command, style subset table, gestures, targets, benchmark table
- [x] Example: `examples/maps/explorer`, `navigation`, `svg-gallery`
- [x] Test names; [x] performance notes; [x] licence/attribution mention in example
- [ ] Screenshot/GIF in the doc (docs/img has navigation-lanes/arrival.png, not the explorer)
- [ ] API reference (only setView/update/draw shown); [ ] step-by-step tutorial; [ ] troubleshooting

## What is missing
1. Screenshot of `examples/maps/explorer` (ZINC_SHOT=... zinc run examples/maps/explorer) and a GIF of panning/zoom; embed in the doc.
2. API table for `MapView`: `setView`, `flyTo`, `zoomAround`, `panBy`, `update`, `draw`, `stats`, `moving`, `pending`, plus helpers `lonToX/latToY/xToLon/yToLat/metersPerPixel` and the `MapOptions` fields.
3. Tutorial: "an offline map of your city": `fetch-tiles.mjs --bbox ... --zoom 10-14`, point `tiles:` at the folder, add a marker/scale bar.
4. Custom style how-to (JSON, a minimal style) and how to add markers (draw with gfx over the map using lonToX).
5. Licence and attribution note for OSM and OpenFreeMap tiles (required by their terms).
6. Troubleshooting: blank tiles (gzip files, wrong path), `?` glyphs for non-Latin, rate limits.
7. Keyboard shortcuts (arrows, Q/E) are documented; confirm in code.
8. (hardware) real Pi 1 timings (doc says not measured).

## Wrong or stale
- Targets table says "wasm, esp32: no", but plugin.json and docs/targets/web.md ship a web build (MapLibre behind `MapView`); the doc should link it.
- Targets table omits windows, listed in plugin.json.
- Unsupported-feature list (no icons, line labels, rotation) should say whether the web (MapLibre) build differs.

## Suggested pages
Map overview; API reference (generated); Tutorial: an offline map; Tile sources and the fetch tool; Style subset; Performance on small machines; Examples (explorer, navigation, svg-gallery); Web build; Attribution and licences; Troubleshooting.
