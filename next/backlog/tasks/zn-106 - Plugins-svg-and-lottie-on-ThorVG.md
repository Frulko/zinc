---
id: ZN-106
title: 'Plugins: svg and lottie on ThorVG'
status: Backlog
assignee: []
created_date: '2026-10-06 22:56'
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
- [ ] #1 conformance lottie.ts and the svg fixtures pass with the tolerance; examples/maps/svg-gallery and ui/lottie-gallery render real content (not the stand-in)
- [ ] #2 binary size of a program that does not use them is unchanged (linked on demand)
<!-- AC:END -->
