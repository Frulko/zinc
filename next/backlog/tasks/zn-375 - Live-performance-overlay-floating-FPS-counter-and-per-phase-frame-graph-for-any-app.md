---
id: ZN-375
title: >-
  Live performance overlay: floating FPS counter and per-phase frame graph for
  any app
status: Backlog
assignee: []
created_date: '2026-10-08 15:50'
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
- [ ] #1 ZINC_PERF_HUD=1 shows the panel over examples/hero with FPS and the phase graph; a recorded frame with the panel differs from one without only inside the panel rectangle
- [ ] #2 the panel's own cost is measured and under 0.3 ms per frame (reported in the notes)
- [ ] #3 it can be dragged, collapsed to a badge and toggled by the hotkey; the numbers match ZINC_PROFILE's summary on the same run
<!-- AC:END -->
