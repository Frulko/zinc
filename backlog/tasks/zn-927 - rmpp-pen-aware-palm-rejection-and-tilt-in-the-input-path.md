---
id: ZN-927
title: 'rmpp: pen-aware palm rejection and tilt in the input path'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-01 12:10'
updated_date: '2026-11-01 13:50'
labels:
  - rmpp
  - size-S
milestone: m-29
dependencies: []
ordinal: 621460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Drop touches while the pen is in range and for 300 ms after pen-up, and touches that start with the pen down. Design, scores and context: docs/reports/murdoku-eink-handwriting.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 tests/rmpp/qtfb.cpp has hover, down and late-touch cases and the existing palm test still passes
- [x] #2 ZINC_RMPP_PALM_MS overrides the delay
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Palm rejection in plugins/display-rmpp/input.h (rin::palm): a finger that lands while the Marker is in range or within ZINC_RMPP_PALM_MS (300) of it leaving is dropped with its moves and release, on the AppLoad and the evdev touch path. tests/rmpp/qtfb.cpp no longer exists (removed with the prototype): the cases (hover, down, late touch, after the delay, env override) live in tests/t1/rmpp_sim.sh via ZN_RMPP_SIM_HOVER/NIB.
<!-- SECTION:NOTES:END -->
