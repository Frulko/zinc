---
id: ZN-529
title: GPU UI renderer on Mali-400 with FP16-safe shaders
status: Backlog
assignee: []
created_date: '2026-10-09 07:41'
labels:
  - chip
milestone: m-24
dependencies:
  - ZN-528
  - ZN-178
ordinal: 320170
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Run the GL UI renderer (R2/R3) on lima: mediump-only shaders (SDF and AA math checked for FP16 range), aggressive batching to keep Mesa's per-draw CPU cost low on one A8, comparison with the software raster on the same frames. (From docs/reports/hardware/ntc-chip.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 kit-gallery full-screen motion is at least 2x faster than the software raster on a PocketCHIP
- [ ] #2 frames are within the ZN-172 tolerance file of the software oracle
- [ ] #3 no shader relies on highp in the fragment stage (checked statically)
<!-- AC:END -->
