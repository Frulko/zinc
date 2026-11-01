---
id: ZN-952
title: 'Hamlet: CachedModel with a bounding box and fromArrays/toArrays'
status: Backlog
assignee: []
created_date: '2026-11-01 13:02'
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
- [ ] #1 beginModel/captureModel touch only the dirty box; same pixels as before (test: every current hamlet model equal before/after)
- [ ] #2 CachedModel.toArrays() and CachedModel.fromArrays() round trip exactly (T0 test)
- [ ] #3 Bake time of the 10 hamlet models measured before/after
- [ ] #4 beginModel documents that it clobbers the live scene
<!-- AC:END -->
