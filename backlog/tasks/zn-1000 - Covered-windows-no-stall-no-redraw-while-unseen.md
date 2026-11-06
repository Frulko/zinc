---
id: ZN-1000
title: 'Covered windows: no stall, no redraw while unseen'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-06 09:35'
updated_date: '2026-11-06 09:55'
labels:
  - size-M
  - perf
  - desktop
dependencies: []
ordinal: 759080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md (compositor line): a window covered mid-run can stall about 1 s (nextDrawable times out at 1001.9 ms and holds the script), and a covered window with an animation redraws at about 100 fps. Measure first (tools/resmon, frame timing), then fix in the macOS host.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Covering a running window never blocks the script for more than a frame: no nextDrawable wait of ~1 s; measured before and after
- [x] #2 A fully covered or minimized window with an animation stops drawing (or drops to a low idle rate) and resumes at once when shown again; CPU measured before and after
- [x] #3 Regression test (T1, background window) that fails on the old behaviour
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured on the M1 Pro, background windows (ZINC_BACKGROUND=1), load average 5 to 10 (other trees building).

Before (develop binary): an animated 400x300 window hidden with orderOut ran at 115.6 fps, minimized at 101.2 fps; covered by other apps' windows a frame waited 1008.1 ms (nextDrawable's timeout), and 1009.9 ms right after orderOut. CPU, a 1100x700 window redrawing 300 rects, hidden 10 s: 2.55 s and 2.56 s (user+sys, 112-113 fps).
After: hidden 10.3-10.7 fps, covered 10.5 fps, minimized 8.8 fps; max gap 103.8 ms (the idle pacing, no drawable wait); shown again 58-62 fps with the first frame within 30-40 ms. CPU in the same 10 s run: 0.29 s and 0.27 s (10.1 fps), about a ninth. Visible windows unchanged at 59-61 fps.

What changed:
- targets/macos/hal_sdl.cpp: the main window is unseen when SDL says OCCLUDED, MINIMIZED or HIDDEN (NSWindowDidChangeOcclusionStateNotification through SDL) with no other window open; then hal_present presents nothing and the poll waits for an event up to 100 ms (SDL_WaitEventTimeout: any event, uncovering or restoring, wakes it at once); the first frame presented afterwards is drawn whole (no stale pixels, checked with ZINC_PRESENT_VERIFY). Off in deterministic runs, with ZINC_FRAMES (tests that count frames) and with ZINC_UNSEEN=draw.
- targets/macos/hal_metal.mm: nextDrawable runs on a queue of its own and the present waits at most 50 ms for it; past that the frame is dropped (the next present is whole) and the drawable goes to the next present. This bounds the stall in the moment before the occlusion event arrives (the first fix alone still showed 1009.9 ms after orderOut).
- plugins/system/native/system.macos.mm: window.show() under ZINC_BACKGROUND orders the window in (deminiaturizes it) without activating the app, so a test can bring it back without taking the focus.
- Test: tests/t1/covered_window.sh (tests/golden/macos/covered). Fails on the old behaviour (ZINC_UNSEEN=draw: hidden at 67.8 fps, never unseen).

Did not reproduce as a drawable stall: minimizing and restoring show a 560-650 ms gap before and after the change; it is AppKit's genie animation running inside the event pump (a 561-579 ms SDL_PollEvent measured), not nextDrawable (no drawable timeout logged). Left alone.

later.md lines (for the coordinator):
- ZN-1000: minimize and restore hold the event pump 0.56-0.65 s for the genie animation (SDL_PollEvent inside AppKit), so the script stalls once each way; the live-resize watcher (zrt_redraw from inside the pump) could keep frames coming.
- ZN-1000: while the window is unseen the compositor's render-thread ticks (animate layers) still run at their floor rate and are thrown away by hal_present; stop them too (comp_live) if a profile shows them.
- ZN-1000: Linux (X11 VisibilityNotify / Wayland frame callbacks), Windows (DWM cloaked, minimized) and iOS/Android backgrounding: the same unseen throttle in the cross-platform pass.
<!-- SECTION:NOTES:END -->
