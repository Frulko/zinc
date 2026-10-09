---
id: ZN-608
title: >-
  Responsive windows: resize events in TypeScript, zinc:ui follows the window,
  zinc.json resize blocks it
status: Done
assignee: []
created_date: '2026-10-09 15:37'
updated_date: '2026-10-09 15:59'
labels:
  - ui
milestone: m-21
dependencies: []
priority: high
ordinal: 5100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner (2026-10-09, on nuxt-ui): resizing a window must re-lay out the app (responsive), with the events offered to TypeScript and an option to block it. Today the SDL HAL letterboxes (a fixed surface scaled) unless zinc.json says resize fill; zinc:ui already re-lays out when width()/height() change (lib/std/ui.ts, frame step). Add zinc:gfx onResize(cb(w, h)): registering asks the host to follow the window (fill), the frame loop calls the callbacks on a new size; zinc:ui registers, so every UI app is responsive; programs that never ask (games drawn at fixed coordinates) keep the fixed surface; zinc.json targets.<t>.resize (fill or letterbox, or ZINC_RESIZE) wins over the request, in zinc run and in programs zinc build writes. New host row appended (ids stay).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 nuxt-ui, hero and kit-gallery re-lay out when the window is resized (fill), with no zinc.json change
- [x] #2 zinc:gfx onResize reports the new size once per change (test)
- [x] #3 zinc.json resize letterbox keeps the fixed scaled surface for a zinc:ui app, in zinc run and in a built program
- [x] #4 games that never ask (breakout, pinball) keep their fixed surface
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a

Done (owner request 2026-10-09, nuxt-ui):
- zinc:gfx onResize(cb(w, h)), typed engine (src/frontend/modules.cpp) and QuickJS (src/qjs/qjs.cpp). The callbacks run before the next frame, once per new size.
- Registering calls the new host row HostGfxSetResize (appended to the table, ids unchanged; a gfx row, not a sys row), served in gfx_host.cpp through the weak hal_set_resize.
- targets/macos/hal_sdl.cpp, hal_set_resize: the surface follows the window (fill) unless:
  - zinc.json resize / ZINC_RESIZE fixed the mode (resize_fixed);
  - the run is deterministic;
  - a device panel is emulated.
  The switch happens at the next poll, between frames.
- zinc:ui's mount registers onResize, so every UI app is responsive (the docs said so; the HAL letterboxed). Games that never ask keep their fixed surface, scaled.
- zinc build writes zinc.json's resize into the program's main (setenv ZINC_RESIZE), as zinc run passes it.
- lib/gfx.d.ts and docs/guide/03-ui-apps.md updated.

Tests:
- New tests/t1/window_resize.sh (macOS, window resized through zinc:system/window, golden tests/golden/macos/resize):
  - gfx program asking: resized to 640 332 once (AC2);
  - gfx program not asking: 500 300 (AC4);
  - ZINC_RESIZE=letterbox: 500 300;
  - zinc:ui app compiled: follows, 640 332 (AC1);
  - zinc:ui app with letterbox: 500 300;
  - program zinc build wrote from a zinc.json saying letterbox: 500 300 (AC3).
- tests/run --changed: 253 passed. layout_bridge failed first (QuickJS's zinc:gfx lacked onResize), fixed and passes; quickjs, script, webgl_js and qjs pass.
- gl_renderer failed once (hero mae 3.007) and passed when rerun. By hand twice: mae 0.159. Likely the mouse over the GL window during the run (hover states): the test is sensitive to the pointer.
- macos_vibrancy is the known ZN-394.
<!-- SECTION:NOTES:END -->
