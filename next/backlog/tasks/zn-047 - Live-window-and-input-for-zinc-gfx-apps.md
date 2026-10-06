---
id: ZN-047
title: 'Live window and input for zinc:gfx apps'
status: Backlog
assignee: []
created_date: '2026-10-06 16:41'
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
- [ ] #1 zinc run tests/visual/ui.tsx opens a window, hover and click work, closing it ends the run
- [ ] #2 keyboard and text input reach zinc:ui text fields; clipboard and cursor work
- [ ] #3 headless pixel goldens (T1, T2) unchanged
- [ ] #4 AOT programs open the same window
<!-- AC:END -->
