---
id: ZN-083
title: 'Real clock by default, virtual clock under ZINC_DETERMINISTIC'
status: Done
assignee: []
created_date: '2026-10-06 22:52'
updated_date: '2026-10-07 03:11'
labels:
  - host-modules
  - size-S
milestone: m-14
dependencies:
  - ZN-082
ordinal: 40250
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Date.now(), performance.now() and sys.clock() follow the host clock by default (audit 01); ZINC_DETERMINISTIC and the goldens keep the virtual clock. performance.timeOrigin, performance.mark/measure minimal.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a program measuring a 50 ms timer sees about 50 ms real time and exactly 50 virtual ms under ZINC_DETERMINISTIC
- [x] #2 all existing goldens unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Date.now (epoch, integer), performance.now/timeOrigin/mark/measure and the timers follow the host clock unless ZINC_DETERMINISTIC (or record/replay); timers really sleep on the libuv loop; the frame loop reads the host clock in a real run. tests/run exports ZINC_DETERMINISTIC=1 so every golden is unchanged; tests/t0/clock_real.sh checks both clocks (50 ms real, exactly 50 virtual). The QuickJS engine keeps its virtual clock.
<!-- SECTION:NOTES:END -->
