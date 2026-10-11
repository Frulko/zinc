---
id: ZN-574
title: 'Gamepad for JS libraries: W3C standard mapping and typed rows'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-09 08:11'
updated_date: '2026-10-11 15:23'
labels:
  - games
  - js
  - size-S
milestone: m-22
dependencies:
  - ZN-568
ordinal: 36000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On top of the input layer of ZN-552 (evdev hub and SDL3 gamepad/joystick subsystems), and the same SDL3 subsystems on macOS: gamepad state and events as host rows; navigator.getGamepads() with the W3C standard mapping (SOUTH/EAST/WEST/NORTH -> b0-b3, shoulders b4-b5, analog triggers b6-b7, BACK/START b8-b9, stick clicks b10-b11, d-pad b12-b15, GUIDE b16, sticks axes 0-3), gamepadconnected/disconnected, vibrationActuator through SDL rumble; typed rows for zinc:gfx and zinc:game; SDL_GameControllerDB (Zlib) embedded. Phaser, Kaplay and LittleJS poll navigator.getGamepads(). (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 an SDL virtual gamepad in a test drives Phaser's GamepadPlugin and Kaplay's onGamepadButtonPress
- [x] #2 button and axis indices match the W3C table for an Xbox and a PlayStation mapping
- [x] #3 headless runs report no gamepads without error
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-11, parallel agent (worktree), Intel Mac, no gamepad attached. HANDOVER: criteria 2 and 3 pass; criterion 1 is half done: Phaser's GamepadPlugin is driven (scripted pad and SDL virtual pad), Kaplay is not in the repository nor in tools/test-lib, so its onGamepadButtonPress is not proven. Next step for it: add kaplay 3001 to tools/test-lib (npm tarball, sha256 pinned), a page tests/golden/webenv/gamepad/kaplay.js with onGamepadButtonPress, run it with ZINC_INPUT=tests/golden/webenv/gamepad/phaser.input in tests/t1/webenv_gamepad.sh; Kaplay also needs its boot (ZN-707).

DONE. HAL: runtime/include/hal.h gains HalGamepad and HalInput.pad[4] (slot = W3C index; buttons as 17 bits in the W3C standard order, trigger[2], axes[4], name, and a rumble request the HAL takes at its next poll). The window HAL (targets/macos/hal_sdl.cpp, gamepads_poll) reads SDL's gamepad layer, polled, started at the second poll so the first frame does not wait for the HID manager; hot-plug by comparing SDL_GetGamepads with the open slots; rumble through SDL_RumbleGamepad. gfx_host adds each pad's d-pad or left stick, face buttons (south A, east B, west X, north Y), shoulders, start and back to the twelve zinc:gfx buttons, so isDown(Btn.A) answers for a gamepad in every existing program. Rows (include/zn/runtime.h, typed in zinc:gfx and lib/gfx.d.ts): gamepadCount, gamepadConnected, gamepadName, gamepadButtons, gamepadButton, gamepadButtonValue, gamepadAxis, gamepadRumble, enums GamepadButton and GamepadAxis. zinc:game does not exist yet (ZN-584): it will read the same rows. Web environment (lib/std/webenv.js): navigator.getGamepads() (live Gamepad objects, mapping 'standard', 17 buttons, 4 axes, null for an empty slot, an empty list with no pad), gamepadconnected and gamepaddisconnected on the window, vibrationActuator.playEffect('dual-rumble') and reset, the classes Gamepad, GamepadButton, GamepadEvent, GamepadHapticActuator. Scripted input (ZINC_INPUT, src/host/hal_dispatch.cpp): gamepad I [NAME], gamepadoff I, gbutton I B [VALUE], gbuttonup I B, gaxis I A VALUE. Test pad: ZINC_VIRTUAL_GAMEPAD=xbox|ps5 plugs an SDL virtual gamepad (the USB ids of an Xbox Series pad or a DualSense) that holds each button in turn, then each axis.

DECISION TO RECORD (the coordinator files it with a number): SDL3's joystick, gamepad, HIDAPI and virtual-joystick code is built in, as SDL builds by default (CMake options forced on, since an older build directory has them cached off). SDL ties its virtual joystick driver to HIDAPI, and the default drivers are the ones every SDL game ships, the only configuration proven on real pads; the alternative (IOKit and GCController only, +70 KB) has no virtual pad for tests. Haptic stays off: rumble goes through the joystick drivers. Measured: libzn_window.dylib 2,141,424 to 2,532,656 bytes (+391 KB), libSDL3.a 2,925,216 to 3,531,864.

Test: tests/t1/webenv_gamepad.sh (PASS, with webenv, webenv_phaser, example_js_phaser, input, input_touch): a page on navigator.getGamepads() with a script (two pads, buttons, a trigger at 0.5, an axis, plug and unplug, rumble), the same page with no pad (no gamepad, empty stderr), Phaser 3.90 GamepadPlugin (connected, down, up, pad.left, L2 0.5, left stick), the typed rows on the interpreter and compiled, and the window HAL on SDL's dummy video driver with the virtual pad as Xbox and as DualSense: SDL's buttons arrive at W3C 0 1 2 3 8 16 9 10 11 4 5 12 13 14 15, the sticks as axes 0 to 3, the triggers as buttons 6 and 7 with their value.

NOT PROVEN: no real gamepad (hot-plug of a USB or Bluetooth pad, rumble that shakes, the raw mappings of real Xbox and PlayStation pads: the virtual pads use SDL's standard layout, so what is proven is our SDL-to-W3C table, not SDL's per-device database); a visible window (the virtual pad ran on the dummy driver); launch_time and the other window tests after the SDL change (to run after integration); display-gl's own event loop (plugins/display-gl/src/sdl.cpp) does not read gamepads; SDL_GameControllerDB is not embedded (SDL's built-in database, plus the file SDL_GAMECONTROLLERCONFIG_FILE names).
<!-- SECTION:NOTES:END -->
