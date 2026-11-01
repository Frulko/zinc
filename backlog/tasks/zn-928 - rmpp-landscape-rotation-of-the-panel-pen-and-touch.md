---
id: ZN-928
title: 'rmpp: landscape rotation of the panel, pen and touch'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-01 12:11'
updated_date: '2026-11-01 13:50'
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
- [x] #1 The notes app runs in landscape in the emulator (headless frame golden, both orientations)
- [x] #2 A scripted test lands pen and touch on the same cell in both orientations
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Landscape: a surface that is the panel transposed (2160x1620) is rotated by rm_present (frame) and rin::app_of (pen and touch); ZINC_RMPP_ROTATE=270 for the other side. app.orientation swaps a project's own width/height for a display driver (selectDisplay). Goldens tests/golden/sim/rmpp-notes-landscape.*; cell tests cellp/cell90/cell270 in tests/t1/rmpp_sim.sh. Not rotated: widgets, docking, ghost zoom, top-edge swipe (physical top).
<!-- SECTION:NOTES:END -->
