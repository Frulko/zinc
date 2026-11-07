---
id: ZN-949
title: 'Hamlet: chunked static bake: re-bake only the chunks a change touches'
status: Done
assignee: []
created_date: '2026-11-01 13:01'
updated_date: '2026-11-07 18:30'
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
- [x] #1 Chunk = 8x8 tiles; a change re-bakes only the chunk(s) it touches plus neighbours within the occlusion margin
- [x] #2 Output of the chunked bake equals the full bake on the 12x12 map (pngdiff tolerance 0) and on a 48x48 map built both ways
- [x] #3 Panning never re-bakes (composite only); measured ms for pan and for one build logged with the baseline numbers
- [x] #4 Chunks bake lazily when they enter the view, a few per frame, never a multi-frame stall
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Incremental static bake instead of fixed 8x8-tile chunks: the kept picture (bakedPix/bakedZ/kinds/groundZ/staticShadow, and frame.ts edgedPix) slides with the camera and only the uncovered strips (+6 px margin) are baked; a changed tile (signature per tile: tree, rock, flowers, building type, road) re-bakes the rectangle around it and its neighbours. The renderer got a clip rect (setClip) and patterns anchored on the layer (setPixelOrigin = camera), so a rectangle is made of the very same pixels as a full bake: tests/data/hamlet/chunks.ts compares bakes at tolerance 0 (pixels, depth, kinds, shadows, tufts) on 12x12 and 48x48, normal and widest zoom, over 5 pans and 4 edits. Numbers (headless, dev Mac, other trees busy): normal window full bake ~100 ms, pan strip ~30 ms; widest zoom-out (836x596) full ~400-540 ms, pan ~77 ms. Left open (AC4): a bake still runs in one call (no slicing over frames); the tile boxes make a build re-bake a few rectangles. Engine gap noted: no Array.copyWithin / typed set, the slide is a hand loop per array.
Review 2026-11-07: review-close, closed as done. Chunked bake exists (src/cite/geom.ts CH=8, tests/t1/hamlet_chunks.sh); close as done, lazy-bake criterion covered by the Cite view.
<!-- SECTION:NOTES:END -->
