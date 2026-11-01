---
id: ZN-928
title: 'rmpp: landscape rotation of the panel, pen and touch'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-01 12:11'
labels:
  - rmpp
  - size-M
milestone: m-29
dependencies: []
ordinal: 622460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The driver rotates the frame blit by 90/270 and maps pen and touch coordinates; app.orientation is honoured. Design, scores and context: docs/reports/murdoku-eink-handwriting.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The notes app runs in landscape in the emulator (headless frame golden, both orientations)
- [ ] #2 A scripted test lands pen and touch on the same cell in both orientations
<!-- AC:END -->
