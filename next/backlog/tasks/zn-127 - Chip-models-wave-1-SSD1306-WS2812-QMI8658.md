---
id: ZN-127
title: 'Chip models wave 1: SSD1306, WS2812, QMI8658'
status: Backlog
assignee: []
created_date: '2026-10-06 22:59'
labels:
  - simulator
  - size-M
milestone: m-11
dependencies:
  - ZN-126
ordinal: 40690
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decision D9 (Level 2): src/sim/chips/ models fed by the bus shim; unit tests with captured byte streams from the real drivers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a captured stream renders the golden bitmap; a deliberately wrong init byte fails the test (which today passes silently)
<!-- AC:END -->
