---
id: ZN-227
title: >-
  UI: virtual keyboard shown by input device, retractable on every layout, no
  clipping
status: Backlog
assignee: []
created_date: '2026-10-07 11:40'
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
- [ ] #3 every layout has the retract control, with a golden per layout family
<!-- AC:END -->
