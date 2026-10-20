---
id: ZN-663
title: 'Several windows for one app: an editor window and a play or preview window'
status: Done
assignee: []
created_date: '2026-10-10 18:26'
updated_date: '2026-10-10 19:44'
labels:
  - desktop
  - editor
  - size-M
milestone: m-27
dependencies: []
ordinal: 419410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Owner's answer, 2026-10-10: wanted for the editors of the showcase demos, behind the demos themselves.) An app opens more than one window (the second half of ZN-249, never split out): each with its own surface, input and frame callback, sharing the program's state; closing the last one ends the app. The pinball table editor and the museum storyboard editor then keep the editing window and the played table or the previewed sequence side by side.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a program opens two windows, draws a different frame in each and receives input for each (scripted test, two pixel goldens)
- [x] #2 closing one window keeps the other; closing the last one ends the program
- [x] #3 zinc:ui renders a tree per window
- [x] #4 docs/guide documents the API
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (D75): zinc:gfx openWindow(title, w, h, cb) / closeWindow(id) / windowOpen(id) (0 = the main window). The runtime (runtime/gfx.cpp beginWindow/endWindow) records a window's commands as a slice of the frame list, rasterizes them into its own pixels on the CPU when their raster::frame_hash changed, hands them to the HAL and drops them; while the callback runs, input, width()/height() and keep() are the window's. HAL contract: six optional hal_win_* calls (runtime/include/hal.h, weak defaults = main window only); SDL HAL: an SDL_Renderer per window, events routed by SDL_GetWindowFromEvent, the main window's pointer/keys only when it has the focus, a closed main window hidden while others are open (its present paces at 60 Hz), the last one ends the program; headless HAL: script events 'window N' and 'close'; ZINC_SHOT writes <name>-w<id>.png. Rows host.gfxOpenWindow/CloseWindow/WindowOpen/BeginWindow/EndWindow appended, in isGfxTailRow. zinc:ui mountWindow(title, w, h, root, bg) and zinc:ui/solid renderWindow: ~70 surface variables swapped with a Surface around the window's frame; clock/anims/scrolls step once per engine frame; a change marks the other surfaces extLayout/extPaint (never back: idle windows stay idle, checked: no paint after frame 15 of 40). Fixed on the way: keep() in a window frame made the main window show its previous frame (kept saved per window). Tests: tests/t1/windows.sh (two pixel goldens per scenario: gfx windows interpreted and compiled, clicks per window, close side first, close main first then the last ends the program at frame 7 of 20; zinc:ui editor + preview updating each other). Docs: docs/guide/03-ui-apps.md 'More than one window', docs/ui.md HAL note. Also fixed native_gen goldens left stale by ZN-657/658 (2fb66bcd). Limits: windows other than the main one draw on the CPU at the main window's density (a zoom-2 main window renders them at 2x then SDL scales down); no smooth trackpad scroll or arrow pad there; zinc:gl and QuickJS main window only (ZN-685); Linux check deferred (ZN-686). T0: 97 passed, native_gen (then fixed) and tls (ZN-610). usage: n/a
<!-- SECTION:NOTES:END -->
