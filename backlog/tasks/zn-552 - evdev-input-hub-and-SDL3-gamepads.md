---
id: ZN-552
title: 'Shared evdev input hub with hot-plug and gamepads'
status: Backlog
assignee: []
created_date: '2026-10-09 07:46'
labels:
  - rpi
  - sdk
  - size-M
milestone: m-25
dependencies:
  - ZN-535
ordinal: 51300
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** Merge the two evdev readers into one header; hot-plug by inotify; gamepads via SDL3 mapping DB on glibc; uinput tests in Linux CI.

One evdev reader shared by display-gl and display-fbdev: keys, mice, MT protocol B multi-touch, gamepads, hot-plug by inotify. On glibc targets, enable the vendored SDL3 3.4.16 joystick and gamepad subsystems for the mapping database and rumble; static builds use raw evdev. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)

Also carries, since the backlog review of 2026-10-10: ZN-527 (Gamepads and USB HID on the CHIP).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 uinput-driven tests for keyboard, two-finger touch and an Xbox-layout gamepad pass in Linux CI
- [ ] #2 FT5x06 touch and a USB gamepad work on the Pi 3B+
- [ ] #3 SDL3 size delta recorded
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. display-fbdev (fbdev.cpp:100-230, MT protocol B) and display-gl (kms.cpp:77) each carry their own evdev reader; no gamepads, no hot-plug. Rewrite: one shared reader with hot-plug and SDL3 gamepad mapping on glibc. Carries ZN-527. Evidence: plugins/display-fbdev/fbdev.cpp:100; plugins/display-gl/src/kms.cpp:77
<!-- SECTION:NOTES:END -->
