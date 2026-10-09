---
id: ZN-532
title: 'PocketCHIP device features: 480x272 density, backlight, battery, power key'
status: Backlog
assignee: []
created_date: '2026-10-09 07:41'
labels:
  - chip
milestone: m-24
dependencies:
  - ZN-519
  - ZN-531
ordinal: 320200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc:ui density and font sizes for a 4.3 inch 480x272 panel, backlight control through /sys/class/backlight, a battery widget fed by CHIP-08, power key to screen off and radios down (no suspend to RAM), examples/hero and kit-gallery checked at 480x272. (From docs/reports/hardware/ntc-chip.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 hero and kit-gallery fit 480x272 without clipping
- [ ] #2 backlight brightness is settable from TypeScript
- [ ] #3 the power key blanks the screen and wakes it
- [ ] #4 the battery widget shows capacity and charging state
<!-- AC:END -->
