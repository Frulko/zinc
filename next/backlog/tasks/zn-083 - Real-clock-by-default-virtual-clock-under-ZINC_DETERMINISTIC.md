---
id: ZN-083
title: 'Real clock by default, virtual clock under ZINC_DETERMINISTIC'
status: Backlog
assignee: []
created_date: '2026-10-06 22:52'
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
- [ ] #1 a program measuring a 50 ms timer sees about 50 ms real time and exactly 50 virtual ms under ZINC_DETERMINISTIC
- [ ] #2 all existing goldens unchanged
<!-- AC:END -->
