---
id: ZN-927
title: 'rmpp: pen-aware palm rejection and tilt in the input path'
status: Backlog
assignee: []
created_date: '2026-11-01 12:10'
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
- [ ] #1 tests/rmpp/qtfb.cpp has hover, down and late-touch cases and the existing palm test still passes
- [ ] #2 ZINC_RMPP_PALM_MS overrides the delay
<!-- AC:END -->
