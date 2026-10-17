---
id: ZN-625
title: >-
  Mobile HAL on ios and android: lifecycle, density, safe areas, orientation,
  back
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-10 14:06'
updated_date: '2026-10-16 20:30'
labels:
  - mobile
  - size-M
milestone: m-26
dependencies:
  - ZN-622
  - ZN-624
ordinal: 199000
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-16 (owner, native fidelity, ../docs/reports/native-fidelity-and-plugins.md §5 step 2): the host feeds the system's signals on Android, iOS and macOS: theme with "auto" by default (dark mode follows the OS), accent colour, safe area insets and their changes, font scale (Dynamic Type / Android font size), the back button and the iOS back gesture.
<!-- SECTION:NOTES:END -->
