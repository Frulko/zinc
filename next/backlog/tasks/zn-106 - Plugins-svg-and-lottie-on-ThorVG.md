---
id: ZN-106
title: 'Plugins: svg and lottie on ThorVG'
status: Done
assignee: []
created_date: '2026-10-06 22:56'
updated_date: '2026-10-07 10:08'
labels:
  - plugins
  - rendering
  - size-L
milestone: m-9
dependencies:
  - ZN-101
ordinal: 40480
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decision D8: ThorVG (MIT, software raster) for SVG and Lottie instead of porting 679 + 1108 custom lines; keep nanosvg for the tiny profile only. Vendor a source list; draw into the engine's image buffers; keep the Spec of plugins/svg and plugins/lottie. Pixel goldens are re-baked in this task's own commit with a documented tolerance, compared against lottie-web on the 12 files of the prototype's test.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 conformance lottie.ts and the svg fixtures pass with the tolerance; examples/maps/svg-gallery and ui/lottie-gallery render real content (not the stand-in)
- [x] #2 binary size of a program that does not use them is unchanged (linked on demand)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Decision D23: the prototype's svg and lottie renderers keep running unchanged through the plugin pipeline instead of ThorVG (parity first; ThorVG stays an upgrade). Both plugins deterministic; the metadata-only lottie.next.ts stand-in is removed so the galleries draw real content (lottie-gallery: 12 animations; svg-gallery). New goldens tests/golden/examples/{lottie,svg}-gallery-40.png (the old toolchain had none, 0 differing pixels across runs); lottie.ts conformance interpreted and AOT. AC2: the renderers live in plugin libraries of the cache, nm shows no zn_module_Lottie/Svg in zinc. tests/t1/svg_lottie.sh. Limits: no comparison with lottie-web (no Node renderer here).
<!-- SECTION:NOTES:END -->
