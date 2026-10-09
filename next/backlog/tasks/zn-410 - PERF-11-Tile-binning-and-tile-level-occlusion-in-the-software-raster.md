---
id: ZN-410
title: PERF-11 Tile binning and tile-level occlusion in the software raster
status: Done
assignee: []
created_date: '2026-10-09 07:34'
updated_date: '2026-10-09 12:05'
labels:
  - perf
  - size-L
milestone: m-21
dependencies:
  - ZN-400
  - ZN-401
priority: high
ordinal: 5100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
raster.cpp:516 render walks every command per band and paints every overdraw layer: 200k scene 60-65 ms on one core for 144.8 M pixel writes (118x overdraw). Harness with the same pixel hash: 16 px tiles, each starting at the last opaque command covering it whole: 7.3 ms on 1 thread, 6.0 ms on 8 (single-threaded binning 6.9 ms is then the bottleneck: parallelize it). Bin effective bounds (clip stack applied), replay CLIP/UNCLIP and rounded-clip corners per tile, per-tile context instead of ZRT_TLS scratch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 200k scene <= 10 ms on 1 thread at 1280x960 (baseline 65 ms)
- [x] #2 render corpus (tools/bench-render) no case slower, pixel hashes identical
- [x] #3 pixel goldens identical
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a

Done (D47):
- runtime/raster.cpp bin() + render_tiles(): 16x16 tiles, binned walking backward; a tile closes under an opaque square RECT or a CLEAR outside any clip, and the walk stops once every tile is closed.
- With clips, a forward pass records each command's tile range with the clip stack; CLIP and UNCLIP are replayed in the tiles of their box.
- The command loop of render() is now run_cmds(), shared by both paths.
- Fallback to render(): under kTilesMin (2048) commands, past 16 nested clips, ZINC_TILES=0, or when 4 x the repeated calls of heavy shapes exceed the hidden commands (then 30 frames without binning).
- runtime/gfx.cpp bins the shown frame once, on the first band that paints it; src/host/backend_sw.cpp bins per draw.
- tools/bench-render writes and checks a pixel hash column; bench/render.csv refreshed.

Measured (zinc capture --bench, bb4.scn 200k balls at 1280x960):
- 1 thread 22.4 -> 8.3 ms, 4 threads 13.9 -> 6.3 ms, same hash a232a804ab7854ee.
- In a window: 87 -> 94.5 fps.
- Render corpus against the HEAD raster (r-head.csv): every hash identical; tools/bench-render --check-regressions exits 0. b1-quads 1767 -> 1225 us on 1 thread, the rest within noise.
- b3-text on 4 threads: 410 us at HEAD in one run against about 530 us now. It does not reach the tiles (251 commands); HEAD's own runs varied from 410 to 732 us, so thread start per draw is the likely cause, but no alternated A/B against a HEAD binary was run.

Tried and dropped:
- Two forward passes (count, fill): 12.9 ms, binning 77% of it.
- Binning every large frame: b2-rounded 14 -> 54 ms.

Tests: new tests/t1/tiles.sh (6141 commands with clips, text, shadows, borders, gradients, polygons and strokes; six frames identical with ZINC_TILES=0); tests/run --changed 4 passed; 24 pixel T1 tests pass (ui, input, canvas, framehash, map, nuxt_ui, rn_showcase, style_*, text_shaped, svg_lottie, three_3d...); proto-capture canary 4 of 4.
<!-- SECTION:NOTES:END -->
