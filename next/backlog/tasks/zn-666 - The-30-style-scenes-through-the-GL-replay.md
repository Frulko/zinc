---
id: ZN-666
title: The 30 style scenes through the GL replay
status: Backlog
assignee: []
created_date: '2026-10-10 18:49'
labels:
  - gpu
  - ui
  - testing
  - size-S
dependencies: []
ordinal: 422410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(From the backlog review of 2026-10-10, docs/reports/backlog-review-2026-10-10.md.) The UI style suite is compared on the software raster only; the window renders through the GL replay, so a style that draws wrong on the GPU is not seen by a test.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 each style scene rendered through the GL replay is within the display-gl tolerance of its software golden, or listed as known with its pixel count
- [ ] #2 the test skips (77) without a GL context
<!-- AC:END -->
