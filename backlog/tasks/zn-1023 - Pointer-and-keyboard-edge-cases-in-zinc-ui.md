---
id: ZN-1023
title: 'Pointer and keyboard edge cases in zinc:ui'
status: Backlog
assignee: []
created_date: '2026-11-07 16:36'
labels:
  - ui
  - a11y
  - input
  - size-M
milestone: m-17
dependencies: []
ordinal: 4400
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Touch: when the primary finger lifts first the others stay recorded and block the next pinch; a left press while a right press holds the capture loses onPointerUp; autoscroll while selecting advances only on pointer moves. Keyboard: Pressable shows no pressed style on Enter/Space; scroll areas take no key (PageDown, End, arrows) -- an accessibility basic; VirtualList shifts the scroll when rows are prepended.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-737: scroll areas take no key (Page Down, End, the arrows).
- ZN-774.18: a keyboard press (Enter, Space) fires Pressable's onPress but does not set `pressed`, so keyboard users see no pressed style (React Native Web sets it, and adds hovered and focused).
- ZN-868: VirtualList shifts the scroll when rows are prepended (history loaded above); keep the anchor row in place.
- ZN-917: auto-scroll while selecting advances only on pointer moves (a timer while the pointer rests at the edge would match browsers); a drag from a Text into an input is not handled and Cmd+A does not select static text; only the root tree is walked, so Text in overlay layers and virtualized rows not built is out of reach of a drag.
- ZN-997: ui.ts touchSecondary: when the primary finger lifts first, the other fingers stay recorded and block the next pinch; clear them when the primary lifts.
- ZN-997: ui.ts releaseAt: a left press while a right press holds the capture loses its onPointerUp; give each button its own capture.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a scripted touch test: primary up first then a new pinch works
- [ ] #2 each button owns its capture
- [ ] #3 Space and Enter set `pressed`; arrows, PageDown, Home and End scroll a ScrollView with focus
- [ ] #4 prepending rows keeps the anchor row in place
- [ ] #5 headless tests for each, one golden
<!-- AC:END -->
