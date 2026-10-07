---
id: ZN-228
title: 'UI: pointer type — mouse never drags to scroll, overlays section layout bug'
status: Backlog
assignee: []
created_date: '2026-10-07 11:40'
labels:
  - ui
  - input
  - core
dependencies: []
ordinal: 110000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Feedback from examples/hero (screens/Kit): (1) With a mouse, click-and-drag scrolls the page as if it were a touch pointer; drag-to-scroll, kinetic scroll, long-press and pinch must only come from touch/pen events (pointer type in the event: mouse, touch, pen), the mouse scrolls with the wheel, trackpad and the scrollbar, and click-drag keeps selection/drag-and-drop semantics. Same rule for any touch-only feature (virtual keyboard, tap highlights). (2) The Kit screen's OVERLAYS section is laid out wrong: its heading and card overlap the 'Settings' card above (the 'Overlays' card is drawn over the slider of Settings, headings OVERLAYS and FEEDBACK AND DATA sit on top of other cards). Find the layout cause (absolute/overlay positioning inside the scroll container, or section height not including overlay content) and fix it in the engine, with a golden of the Kit screen scrolled to the overlays. Core UI (lib/std/ui, kit). Check against the prototype that it is not a regression of this engine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 mouse drag does not scroll; touch/pen drag does; a test feeds mouse and touch events and checks the scroll offset
- [ ] #2 the Kit overlays section no longer overlaps its neighbours (golden)
<!-- AC:END -->
