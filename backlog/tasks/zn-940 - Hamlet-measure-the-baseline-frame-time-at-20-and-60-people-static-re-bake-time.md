---
id: ZN-940
title: >-
  Hamlet: measure the baseline: frame time at 20 and 60 people, static re-bake
  time
status: Backlog
assignee: []
created_date: '2026-11-01 12:59'
labels:
  - hamlet
  - demo
  - m1
  - perf
  - size-S
milestone: m-30
dependencies: []
ordinal: 700010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every claim of the pixel-plays study is a count, not a time. Measure before changing the renderer or baking anything. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A bench entry (tools/bench or zinc bench) runs examples/hamlet headless with 20 and 60 people for N frames and prints ms/frame
- [ ] #2 rebakeStatic time is printed
- [ ] #3 Numbers logged in docs/reports/zinc-next-perf.md by the coordinator (in the final report when run in a worktree)
<!-- AC:END -->
