---
id: ZN-443
title: 'Tile maps: Tiled and LDtk importers, zinc:tilemap'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-09 07:36'
updated_date: '2026-10-11 16:50'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies:
  - ZN-434
  - ZN-438
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A script importer turns Tiled .tmj/.tmx and LDtk .ldtk into binary layers and typed objects, with tilesets through the atlas. A pure-Zinc zinc:tilemap draws the visible chunks. Report: docs/reports/games/toolchain-assets-loading.md (4.8).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 one Tiled and one LDtk level render like the editors' PNG exports within tolerance
- [x] #2 load time is in the notes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (agent worktree, 2026-10-11).

What: a built-in importer `tilemap` (src/assets/tilemap.cpp, yyjson) turns Tiled .tmj (tilesets embedded or external .tsj; layer data as array, base64 plain, zlib, gzip, zstd; groups with offset, opacity, visibility, parallax, tint; object layers with typed properties) and LDtk .ldtk (every level of the project and its worlds; IntGrid values and auto tiles, AutoLayer, Tiles, Entities with fields) into the entry <map>.tilemap (a text table, docs/reports/zinc-next-assets.md 'Tile maps'). The tiles a map uses are cut from their tileset images as frames of the atlas named by the rule (default 'tiles'), named <image>#x,y,w,h (',t': Tiled's diagonal flip baked by transposing the texels, so a cell only mirrors at run time); buildAtlas keeps one of two identical frames of one name (maps sharing a tileset). The build's single 'sheet' side file became a list of files an importer reads (deps), with their paths and the source's path in the key. plugins/tilemap (zinc:tilemap, pure Zinc): load(name) -> TileMap (levels, frames), Level.draw(camX, camY, viewW, viewH) draws only the cells whose tiles reach the view (visible layers, parallax), Layer.tile/value/col/row for collisions, MapObject and Properties (typed accessors). Docs: docs/plugins/tilemap.md, docs/reports/zinc-next-assets.md.

AC1 (tests/t1/tilemap.sh, 7 s): 'tilemap: ok (Tiled 260x275: 1176 pixels differ, by 1 at most; LDtk Level_1 256x272: 0 pixels differ, by 0 at most; view 100x80: 0 pixels differ, by 0 at most; interpreter and QuickJS 442439ac4b8ed9c3)'. LDtk: its own test project tests/levelBgs.ldtk (MIT) and the PNG LDtk saved for Level_1 (Inca tileset by Kronbits, CC0); exact, 5 flipped tiles included. Tiled: a map written for the test from Level_1 plus every flip of an asymmetric tile (D, H, V combinations), zlib and gzip layers, a layer offset, a group with opacity 0.5 over a 0.8 layer of translucent tiles, a hidden layer, objects; reference rendered by Tiled 1.12.2's own tmxrasterizer (Tiled-1.12.2_macOS-13+.zip sha256 75712ec3...0433) on this Mac; within 1 (Qt composites the translucent layer in premultiplied 8-bit). The culled view (38 tiles drawn instead of 81) matches the crop exactly. Native build is the scripted proof; interpreter and QuickJS draw the same frame hash. Sources and licences: tests/data/tilemap/NOTICE.

AC2, load times (Intel Mac, load average 7 to 8 from other trees: not a quiet-machine number):
- import (zinc assets build, cache miss): the test's Tiled map 2.0 ms, the LDtk project (4 levels) 2.3 ms; a generated 256x256 Tiled map with 3 layers (196,608 cells, 280 tiles) 33 ms (351 ms before caching cells by gid: 10x).
- run time, load() (read the table, parse it, look up the atlas frames): both test maps together 2 to 3 ms (native and interpreter); the 256x256x3 map 56 to 72 ms, median 58 (native and interpreter alike); drawing a 1280x720 view of it queues 6,196 tiles in 2 to 4 ms. QuickJS's Date.now did not advance during the run (0 ms printed): not measured there.
- parser choice measured: split(',') + parseInt 10 to 12 ms per 65,536 cells native, a charCodeAt loop 20 ms: split kept.

Decisions (for a decision record):
1. Built-in importer, not a Zinc script importer. Scored per RULES 4: built in (yyjson, the pattern of the sprite sheets of D95) fit 4, perf 5, size 4, maint 4, licence 5, portability 5, effort 5 = 63; a Zinc script run by the interpreter at build time (D91, report 4.1) fit 4, perf 3, size 4, maint 3 (no script importer mechanism exists: dependency discovery, a way for its tiles to reach the atlas), licence 5, portability 5, effort 2 = 52. Revisit when a second data format (dialogue, CSV) or user-defined importers are asked for: the table format stays, so zinc:tilemap does not change.
2. .tmx/.tsx (XML) are refused with the advice to save as JSON or run 'tiled --export-map json': no XML parser is vendored (third_party/README.md); report 4.10 says tmxlite only if asked.
3. Text table, not binary u16 layers (consistent with D95): 0.3 us a cell to parse; revisit for maps beyond about a million cells or when the parse shows in load profiles.
4. One frame per used tile (extruded, trimmed, transposed variant for the diagonal flip) rather than the tileset image as one frame: no seams under linear filtering when scaled, only used tiles packed, no rotation at draw time (exact on every renderer).

later.md lines (for the coordinator):
- ZN-443: tileset images a map reads are also packed as image entries (286 KB rgba8 for the test's tileset): a rule to leave a file out of the packs, or skip tileset images only the built-in rule takes.
- ZN-443: Tiled infinite maps (chunks), isometric/hexagonal orientation, image layers, collection-of-images tilesets, tile animations and per-tile properties/collision shapes; LDtk separate level files (.ldtkl), level background images, per-tile alpha, layer parallax.
- ZN-443: zinc:tilemap has no hot reload of a map's table under zinc dev (the atlas pages already reload): reuse Level objects by name on onReload.
- ZN-443: .tmx/.tsx through a vendored XML parser (tmxlite or pugixml) if users ask.
- ZN-443: QuickJS's Date.now did not advance within a headless run (load printed 0 ms): check whether that is intended.
- Cross-platform pass: tests/t1/tilemap.sh on Linux and the browser export (zinc:tilemap needs packs: load throws without them).

Tests run: tilemap, sprite_atlas, assets, project_assets, splash (PASS). Not checked: GL renderer pixels (headless software rasterizer only), zinc dev reload, other targets.
usage: n/a (tools/usage)
<!-- SECTION:NOTES:END -->
