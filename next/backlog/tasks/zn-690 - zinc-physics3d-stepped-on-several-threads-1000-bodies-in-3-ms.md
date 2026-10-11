---
id: ZN-690
title: 'zinc:physics3d: stepped on several threads, 1,000 bodies in 3 ms'
status: Backlog
assignee: []
created_date: '2026-10-10 19:46'
updated_date: '2026-10-11 18:10'
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
- [x] #3 the replay test of physics3d still gives identical positions
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-11 (zinc-33, from ZN-583, cbb6a259): zinc:physics3d steps on Jolt's thread pool with threads: 0 (one per core); tests/t1/physics3d.sh passes on main after integration (drop.out on the interpreter, compiled, QuickJS and compiled on 4 threads; both replays identical): criterion 3. Criteria 1 and 2 wait for a measure alone: the machine stayed at load 5.5 to 10 with the CPU held at 37 to 60% by heat all day. Under that load, compiled: one thread 5.97 to 8.19 ms, one per core 3.14 to 3.64 ms (medians; table in docs/reports/zinc-next-perf.md, ZN-583). Next command, alone on a quiet machine: cd next && build/zinc build bench/physics3d_pile.ts -o /tmp/pile && /tmp/pile 1000 1; /tmp/pile 1000 0 (three times); write before (1 thread) and after (one per core) in the perf log, tick 1 and 2 when the one-per-core median is 3 ms or less. usage: n/a
<!-- SECTION:NOTES:END -->
