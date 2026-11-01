---
id: ZN-952
title: 'Hamlet: CachedModel with a bounding box and fromArrays/toArrays'
status: Done
assignee: []
created_date: '2026-11-01 13:02'
updated_date: '2026-11-01 14:21'
labels:
  - hamlet
  - demo
  - m1
  - pixel-plays
  - perf
  - size-S
milestone: m-30
dependencies:
  - ZN-951
ordinal: 700130
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
captureModel scans 100,800 px and beginModel clears two buffers: too slow for hundreds of frames, and a model cannot be saved. Track a dirty box in plot/sphere/capsule/box and expose the packed arrays. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 beginModel/captureModel touch only the dirty box; same pixels as before (test: every current hamlet model equal before/after)
- [x] #2 CachedModel.toArrays() and CachedModel.fromArrays() round trip exactly (T0 test)
- [x] #3 Bake time of the 10 hamlet models measured before/after
- [x] #4 beginModel documents that it clobbers the live scene
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done. beginModel now bakes into a private scratch picture (the live pix/zb are never touched, so beginModel no longer clobbers the live scene: AC4 satisfied by removing the problem and documented in the renderer comment). The dirty box is tracked in sphere/box/plot. Box and whole-buffer reads proved equal for primitives and the 11 hamlet models (tests/t0/hamlet_atlas.sh). Bake of the hamlet models: ~100 ms reading the whole buffer (first version) vs ~26 ms with the box. Renderer files live in examples/pixel-plays/src/native/renderer.ts (untracked, not committed).
<!-- SECTION:NOTES:END -->
