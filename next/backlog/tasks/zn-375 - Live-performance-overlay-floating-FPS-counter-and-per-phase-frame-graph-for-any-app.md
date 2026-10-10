---
id: ZN-375
title: >-
  Live performance overlay: floating FPS counter and per-phase frame graph for
  any app
status: Done
assignee: []
created_date: '2026-10-08 15:50'
updated_date: '2026-10-10 12:12'
labels:
  - devtools
  - ui
  - perf
milestone: m-20
dependencies: []
ordinal: 55990
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-08: at run time, a floating, draggable perf panel over any zinc:ui program, like React Native's perf monitor and Chrome's FPS meter. Opened with ZINC_PERF_HUD=1, a dev-build hotkey (Cmd/Ctrl+Shift+P) or zinc.json dev option; drawn by the runtime as an overlay (like ZINC_VISUALIZE), not part of the app's tree, so it never changes layout or goldens. Shows: FPS and frame time (current, p50, p99), a scrolling stacked graph of the last ~120 frames by phase (app, input, anim, layout, paint, raster, present: the marks of ZINC_PROFILE) with the 16.7 ms line, dropped frames, the program/UI/raster split, draw commands and damage area, layout passes, live objects and allocations per frame (ZN-192 counters), and the engine (interpreter, AOT, QuickJS). Collapsible to a small FPS badge; works in the AOT and on devices with a display (Pi); also sent over the inspector (Performance) when connected.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ZINC_PERF_HUD=1 shows the panel over examples/hero with FPS and the phase graph; a recorded frame with the panel differs from one without only inside the panel rectangle
- [x] #2 the panel's own cost is measured and under 0.3 ms per frame (reported in the notes)
- [x] #3 it can be dragged, collapsed to a badge and toggled by the hotkey; the numbers match ZINC_PROFILE's summary on the same run
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-10. runtime/gfx.cpp hud:: (the shared runtime, so the prototype gets it too): an overlay drawn after the program's frame like the red box (render_rows, render_damage and the GPU command lists), allocated when first shown. Shows FPS and the time between frames, work p50/p99 (the profiler's frames, the same computation as ZINC_PROFILE's summary), dropped frames (> 25 ms), draw commands, damage %, the 9 phases averaged over 30 frames in the colours of a 120-frame stacked graph with a 16.7 ms line, and a host line (Zinc Next: engine name, the runtime allocator's live blocks and allocations per frame; src/host/gfx_host.cpp hudInfo, setEngineName). Opened by ZINC_PERF_HUD=1, zinc.json dev.perfHud, or Cmd/Ctrl+Shift+P; dragged anywhere, its '-' collapses it to an FPS badge; the program does not see a pointer pressed on it. Rebuilt 10 times a second (every frame while dragged); software frames paint it once into its own pixels and copy them into damaged rows; its rectangle joins the damage only when rebuilt.
AC1: tests/t1/perf_hud.sh: hero with and without the panel differ exactly in the panel's rectangle (tools/pngdiff --bbox, new option).
AC2: own cost (build + paint + copy, printed with ZINC_PROFILE=1): 0.14-0.19 ms per frame on the CPU renderer at Retina density with hero repainting each frame (0.64-0.70 ms before the pixel cache and the 10 Hz rebuild), 0.00-0.01 ms on the GPU renderer and headless.
AC3: the test drags it by its title through ZINC_INPUT (the input script now takes several modifiers: shift+meta), collapses it, shows it with Cmd+Shift+P, and checks its work p50/p99 equal ZINC_PROFILE's on the same run.
Not done (not in the criteria): sending the panel over the inspector's Performance domain (the Tracing domain already streams the same spans).
Tests: perf_hud, scene_dump, backend_sw, damage_sig, ui_style, project; full T1 259 passed, the 5 known machine failures. usage: n/a
<!-- SECTION:NOTES:END -->
