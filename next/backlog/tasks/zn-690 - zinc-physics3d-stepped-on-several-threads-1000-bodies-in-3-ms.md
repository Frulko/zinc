---
id: ZN-690
title: 'zinc:physics3d: stepped on several threads, 1,000 bodies in 3 ms'
status: Backlog
assignee: []
created_date: '2026-10-10 19:46'
labels:
  - physics
  - perf
  - size-M
dependencies: []
ordinal: 451410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Follow-up of the first playable pinball, D77.) One thread steps 1,000 awake piled bodies in 4.1 to 4.5 ms (measured on a loaded, heat-throttled machine; Jolt's own step is 4.3 ms of it), against the 3 ms target of ZN-583. Measure alone first, then give Jolt its job system on the machine's cores with the stepping still deterministic.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the step time of bench/physics3d_pile.ts measured alone, before and after, in docs/reports/zinc-next-perf.md
- [ ] #2 1,000 bodies step in 3 ms or less compiled, or the measured floor and why
- [ ] #3 the replay test of physics3d still gives identical positions
<!-- AC:END -->
