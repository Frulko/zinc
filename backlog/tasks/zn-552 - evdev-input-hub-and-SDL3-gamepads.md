---
id: ZN-552
title: evdev input hub and SDL3 gamepads
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
ordinal: 150000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
One evdev reader shared by display-gl and display-fbdev: keys, mice, MT protocol B multi-touch, gamepads, hot-plug by inotify. On glibc targets, enable the vendored SDL3 3.4.16 joystick and gamepad subsystems for the mapping database and rumble; static builds use raw evdev. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)

Also carries, since the backlog review of 2026-10-10: ZN-527 (Gamepads and USB HID on the CHIP).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 uinput-driven tests for keyboard, two-finger touch and an Xbox-layout gamepad pass in Linux CI
- [ ] #2 FT5x06 touch and a USB gamepad work on the Pi 3B+
- [ ] #3 SDL3 size delta recorded
<!-- AC:END -->
