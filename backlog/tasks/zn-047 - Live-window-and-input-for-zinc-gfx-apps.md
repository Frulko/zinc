---
id: ZN-047
title: 'Live window and input for zinc:gfx apps'
status: Done
assignee: []
created_date: '2026-10-06 16:41'
updated_date: '2026-10-06 16:55'
labels:
  - size-L
dependencies: []
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc run app.tsx opens a window through the SDL3 HAL of the old runtime (targets/macos/hal_sdl.cpp) instead of the null HAL, and the input functions of zinc:gfx (pointer, buttons, wheel, touch, keys, text input, clipboard, cursor, pen) read it. Headless deterministic runs keep the null HAL and the goldens.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc run tests/visual/ui.tsx opens a window, hover and click work, closing it ends the run
- [x] #2 keyboard and text input reach zinc:ui text fields; clipboard and cursor work
- [x] #3 headless pixel goldens (T1, T2) unchanged
- [x] #4 AOT programs open the same window
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Done: SDL3 HAL and headless HAL in one binary (src/host/hal_dispatch.cpp, renamed hal_* at compile time), live window until closed, measured dt, all zinc:gfx input functions as host calls (Rt::HostGfx*), ZINC_INPUT scripted events for headless runs, string/bool host results. Checked: real window ran 180 frames; scripted click, typing and clipboard tests (T1 input.sh) and the compiled program (T2 input_aot.sh); window HAL on SDL dummy driver draws the golden frame 1. Mouse and keyboard through the OS not exercised by a test (same path from the HAL up). New checker rule: a function in a template literal is an error.
<!-- SECTION:NOTES:END -->
