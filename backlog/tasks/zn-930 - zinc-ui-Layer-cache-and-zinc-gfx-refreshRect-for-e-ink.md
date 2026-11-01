---
id: ZN-930
title: 'zinc:ui Layer cache and zinc:gfx refreshRect for e-ink'
status: Backlog
assignee: []
created_date: '2026-11-01 12:11'
labels:
  - ui
  - rmpp
  - perf
  - size-M
milestone: m-29
dependencies:
  - ZN-929
ordinal: 624460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A Layer component caches a subtree as an image with invalidate(); refreshRect(rect, fast|quality|full) is an additive HAL field mapped to the rmpp waveform choice (eink.h). Design, scores and context: docs/reports/murdoku-eink-handwriting.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An unchanged layer issues no draw commands
- [ ] #2 The rmpp harness records the requested refresh mode per rect
<!-- AC:END -->
