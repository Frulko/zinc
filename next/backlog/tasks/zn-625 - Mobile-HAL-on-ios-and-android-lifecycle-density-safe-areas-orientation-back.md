---
id: ZN-625
title: >-
  Mobile HAL on ios and android: lifecycle, density, safe areas, orientation,
  back
status: Backlog
assignee: []
created_date: '2026-10-10 14:06'
labels:
  - mobile
  - size-M
milestone: m-26
dependencies:
  - ZN-622
  - ZN-624
ordinal: 385340
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Background and foreground events in the event watch (stop drawing, save state through an app event), GL context loss, pixel density with a cap, `SDL_GetWindowSafeArea` into `ui.setSafeArea`, rotation as a resize, the Android back button as a key (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a headless test on the desktop drives the new events through `ZINC_INPUT` (`background`, `foreground`, `safe-area t r b l`, `rotate`) with a golden
- [ ] #2 on the emulator and simulator rn-showcase survives home and return, and rotation
<!-- AC:END -->
