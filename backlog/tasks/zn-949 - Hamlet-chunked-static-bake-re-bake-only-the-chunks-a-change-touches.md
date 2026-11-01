---
id: ZN-949
title: 'Hamlet: chunked static bake: re-bake only the chunks a change touches'
status: Backlog
assignee: []
created_date: '2026-11-01 13:01'
labels:
  - hamlet
  - demo
  - m1
  - map
  - perf
  - size-M
milestone: m-30
dependencies:
  - ZN-948
  - ZN-940
ordinal: 700100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build and demolish re-bake the full 100,800 px today. Bake the world in 8x8-tile chunks (own pix/z/kinds rect), composite visible chunks into bakedPix/bakedZ on pan or change, with a 4 px margin for occlusion. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Chunk = 8x8 tiles; a change re-bakes only the chunk(s) it touches plus neighbours within the occlusion margin
- [ ] #2 Output of the chunked bake equals the full bake on the 12x12 map (pngdiff tolerance 0) and on a 48x48 map built both ways
- [ ] #3 Panning never re-bakes (composite only); measured ms for pan and for one build logged with the baseline numbers
- [ ] #4 Chunks bake lazily when they enter the view, a few per frame, never a multi-frame stall
<!-- AC:END -->
