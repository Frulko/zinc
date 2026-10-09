---
id: ZN-581
title: 'GPU sprite path for zinc:gfx images (rotation, scale, tint, blend, batching)'
status: Backlog
assignee: []
created_date: '2026-10-09 08:12'
labels:
  - games
  - js
  - size-L
milestone: m-22
dependencies:
  - ZN-432
ordinal: 360270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The native-tier zinc:gfx bunnymark costs 25 ns per sprite of program time in AOT but the software rasterizer takes 11 ms for 2,000 26x37 sprites and 107 ms for 20,000 at Retina scale, so the native tier is capped near 3,000 sprites. Extend ZN-432's drawImageRect row with rotation, scale, tint and blend mode, and draw image commands in display-gl as textured quads batched by texture; the software rasterizer stays the reference. ZN-412 (GL backend by default) makes this the default path; ZN-467 is the fixed-function replay for GPUs without shaders; atlases come from ZN-438. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the zinc:gfx bunnymark (26x37 sprites, 800x600 Retina) renders 20,000 sprites with frame work <= 4 ms in AOT on the GL backend (today raster 107 ms)
- [ ] #2 pixel parity with the software path within display-gl's GPU tolerance
- [ ] #3 the GLES2 (Pi 3) path compiles under the D29 prelude
<!-- AC:END -->
