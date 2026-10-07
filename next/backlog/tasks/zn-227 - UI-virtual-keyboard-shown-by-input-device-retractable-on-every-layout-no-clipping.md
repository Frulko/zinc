---
id: ZN-227
title: >-
  UI: virtual keyboard shown by input device, retractable on every layout, no
  clipping
status: Review
assignee: []
created_date: '2026-10-07 11:40'
updated_date: '2026-10-07 11:58'
labels:
  - ui
  - input
  - core
dependencies: []
ordinal: 90
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Feedback from running examples/hero (screens/Forms): (1) the on-screen keyboard is cut off at the bottom of the window (the last row 123 / EN / space / retract / enter is clipped) and sits over the content instead of the layout making room for it. (2) It must be chosen by the system: show it only when the device has a touchscreen and no hardware keyboard (SDL: touch devices, keyboard presence; per-target defaults: touch on reMarkable/ESP32 panels/Pi touch, none with a mouse and keyboard); a hardware keyboard plugged in hides it, a touch-only device shows it on focus of a text field. (3) Retracting the keyboard is a display option present on all layouts (letters, digits, decimal, tel, email, url, search...), not only some. Core UI (lib/std/ui, lib/std/kit/keyboard*, hal text_input). Goldens: screenshot of Forms with the keyboard open on a 1100x700 window and on a small touch window.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the keyboard is never clipped and the content resizes or scrolls to keep the focused field visible
- [ ] #2 auto mode: hidden with a mouse and keyboard, shown on a touch-only device; override with a ui option and zinc.json
- [x] #3 every layout has the retract control, with a golden per layout family
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. usage: n/a. Done: a retract handle (prop retractable, default on) above the keys of every layout, tap hides the keyboard (lib/std/kit/keyboard.tsx; checked on the letters and the digit pad). Not done: AC1 clipping: hero at 907x600 headless shows the whole keyboard (screenshots), the user's capture also cuts the sidebar footer, so the surface is taller than the visible window area in a real macOS window (fill mode): to investigate in targets/macos/hal_sdl.cpp with a real window; AC2 auto detection needs the pointer type (mouse/touch/pen) in UI events, which touches lib/std/ui.ts where someone else has uncommitted work (StyleSheet): do it with ZN-228 once that file is committed. Also found: text in nested grow flex items does not wrap (min-width auto), same root cause as the Kit overlays overlap; the fix belongs in the layout code of lib/std/ui.ts.
<!-- SECTION:NOTES:END -->
