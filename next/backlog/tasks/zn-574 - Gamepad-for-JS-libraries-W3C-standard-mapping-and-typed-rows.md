---
id: ZN-574
title: 'Gamepad for JS libraries: W3C standard mapping and typed rows'
status: Backlog
assignee: []
created_date: '2026-10-09 08:11'
labels:
  - games
  - js
  - size-S
milestone: m-22
dependencies:
  - ZN-568
  - ZN-552
ordinal: 353270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On top of the input layer of ZN-552 (evdev hub and SDL3 gamepad/joystick subsystems), and the same SDL3 subsystems on macOS: gamepad state and events as host rows; navigator.getGamepads() with the W3C standard mapping (SOUTH/EAST/WEST/NORTH -> b0-b3, shoulders b4-b5, analog triggers b6-b7, BACK/START b8-b9, stick clicks b10-b11, d-pad b12-b15, GUIDE b16, sticks axes 0-3), gamepadconnected/disconnected, vibrationActuator through SDL rumble; typed rows for zinc:gfx and zinc:game; SDL_GameControllerDB (Zlib) embedded. Phaser, Kaplay and LittleJS poll navigator.getGamepads(). (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 an SDL virtual gamepad in a test drives Phaser's GamepadPlugin and Kaplay's onGamepadButtonPress
- [ ] #2 button and axis indices match the W3C table for an Xbox and a PlayStation mapping
- [ ] #3 headless runs report no gamepads without error
<!-- AC:END -->
