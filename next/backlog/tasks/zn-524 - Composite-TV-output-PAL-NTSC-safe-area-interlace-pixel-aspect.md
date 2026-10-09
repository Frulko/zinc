---
id: ZN-524
title: 'Composite TV output: PAL/NTSC, safe area, interlace, pixel aspect'
status: Backlog
assignee: []
created_date: '2026-10-09 07:41'
labels:
  - chip
milestone: m-24
dependencies:
  - ZN-522
ordinal: 320120
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc.json display.tv {standard: pal|ntsc, overscan}: mode selection on the TVE connector, safe-area insets in zinc:ui, pixel-aspect correction (720 wide 4:3), interlace-friendly theme defaults (no 1 px horizontal lines), optional half-resolution rendering scaled by a display-engine plane when sun4i supports it. (From docs/reports/hardware/ntc-chip.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 hero and kit-gallery render inside the safe area at 720x576 PAL and 720x480 NTSC
- [ ] #2 circles stay round on a 4:3 TV
- [ ] #3 fps and raster time recorded for both standards
- [ ] #4 the safe-area insets are covered by a layout golden
<!-- AC:END -->
