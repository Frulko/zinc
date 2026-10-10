---
id: ZN-627
title: 'Mobile GPU path: GLES 3 replay on android, renderer decision for ios'
status: Backlog
assignee: []
created_date: '2026-10-10 14:07'
labels:
  - mobile
  - size-M
milestone: m-26
dependencies:
  - ZN-622
  - ZN-624
ordinal: 385360
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`gl_replay` on a GLES 3 context on Android; on iOS measure the software raster through Metal, GLES through EAGL and (if needed) ANGLE, and decide (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 frame times of rn-showcase and hero on both in `docs/reports/zinc-next-perf.md`
- [ ] #2 pixels equal to the desktop GL goldens within the existing tolerance
- [ ] #3 a decision record for iOS
<!-- AC:END -->
