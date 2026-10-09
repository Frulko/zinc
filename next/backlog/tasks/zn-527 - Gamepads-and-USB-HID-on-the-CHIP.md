---
id: ZN-527
title: Gamepads and USB HID on the CHIP
status: Backlog
assignee: []
created_date: '2026-10-09 07:41'
labels:
  - chip
milestone: m-24
dependencies:
  - ZN-522
ordinal: 320150
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Map evdev gamepads (BTN_SOUTH/EAST/..., ABS_HAT0X/Y, sticks) to zinc:gfx buttons in the display plugin, with hot plug, using the SDL game controller database subset as the mapping source; covers the CHIP host port and the PocketCHIP USB-A port. Makes CHIP + composite + gamepad a TV console. (From docs/reports/hardware/ntc-chip.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 an Xbox-compatible and an 8BitDo pad drive bouncing-ball and the game-2d template
- [ ] #2 hot plug works without restarting the program
- [ ] #3 uinput-injected gamepad events pass a test in the CHIP-03 guest
<!-- AC:END -->
