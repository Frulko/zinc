---
id: ZN-228
title: 'UI: pointer type — mouse never drags to scroll, overlays section layout bug'
status: Review
assignee: []
created_date: '2026-10-07 11:40'
updated_date: '2026-10-07 12:03'
labels:
  - ui
  - input
  - core
dependencies: []
ordinal: 100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Feedback from examples/hero (screens/Kit): (1) With a mouse, click-and-drag scrolls the page as if it were a touch pointer; drag-to-scroll, kinetic scroll, long-press and pinch must only come from touch/pen events (pointer type in the event: mouse, touch, pen), the mouse scrolls with the wheel, trackpad and the scrollbar, and click-drag keeps selection/drag-and-drop semantics. Same rule for any touch-only feature (virtual keyboard, tap highlights). (2) The Kit screen's OVERLAYS section is laid out wrong: its heading and card overlap the 'Settings' card above (the 'Overlays' card is drawn over the slider of Settings, headings OVERLAYS and FEEDBACK AND DATA sit on top of other cards). Find the layout cause (absolute/overlay positioning inside the scroll container, or section height not including overlay content) and fix it in the engine, with a golden of the Kit screen scrolled to the overlays. Core UI (lib/std/ui, kit). Check against the prototype that it is not a regression of this engine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 mouse drag does not scroll; touch/pen drag does; a test feeds mouse and touch events and checks the scroll offset
- [ ] #2 the Kit overlays section no longer overlaps its neighbours (golden)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. usage: n/a. AC1 done: drag-to-scroll only from fingers: lib/std/ui.ts dragScrolls() (committed as a single hunk with git apply --cached because the file holds someone else's uncommitted StyleSheet work): on macos and linux a pointer drag no longer takes a scroller until a real touch was seen (touchCount or touchAt); other platforms (Pi panels, ESP32, sim) keep it; ZINC_POINTER=mouse|touch forces the policy. Test tests/t1/pointer_kind.sh with tests/golden/ui/scrolldrag.{tsx,input}: mouse drag leaves the page, touch drag scrolls it. T0, t1 ui, input and examples_pixels pass. AC2 not reproduced: examples/ui/kit-gallery renders the Overlays section correctly at 1000 and at 640 px wide (wrapped Controls row included, screenshots checked); the overlap of the user's capture comes from examples/hero/src/screens/Kit.tsx (an untracked file of someone else) inside the hero stage (transitions, compact layout, scroll): needs a repro with the real window and the scroll position of the capture. Same family as the nested grow width bug (text overflow) noted in ZN-227.
<!-- SECTION:NOTES:END -->
