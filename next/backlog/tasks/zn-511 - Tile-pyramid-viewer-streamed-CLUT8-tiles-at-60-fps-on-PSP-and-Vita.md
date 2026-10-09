---
id: ZN-511
title: 'Tile-pyramid viewer: streamed CLUT8 tiles at 60 fps on PSP and Vita'
status: Backlog
assignee: []
created_date: '2026-10-09 07:40'
labels:
  - handheld
  - pocketjs
milestone: m-23
dependencies:
  - ZN-488
  - ZN-471
ordinal: 300580
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A Figma-class viewer: a large image or vector document baked to CLUT8 tile pyramids (one palette per page, RLE tiles, solid-tile markers, dedupe), at most two tile decodes per frame nearest to the centre first, a one-tile prefetch ring, levels at x2 spacing, analog panning at 60 fps. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PSP hardware receipt: 60 fps while panning and zooming over the tape
- [ ] #2 Memory high-water stays within the PSP-1000 budget
- [ ] #3 Vita receipt at density 2
<!-- AC:END -->
