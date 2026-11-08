---
id: ZN-1023
title: 'Pointer and keyboard edge cases in zinc:ui'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:36'
updated_date: '2026-11-08 20:53'
labels:
  - ui
  - a11y
  - input
  - size-M
milestone: m-17
dependencies: []
ordinal: 4400
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
- [x] #1 a scripted touch test: primary up first then a new pinch works
- [x] #2 each button owns its capture
- [x] #3 Space and Enter set `pressed`; arrows, PageDown, Home and End scroll a ScrollView with focus
- [x] #4 prepending rows keeps the anchor row in place
- [x] #5 headless tests for each, one golden
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (worker branch, 2026-11-08).
Research: Pointer Events 3 (https://www.w3.org/TR/pointerevents3/): chorded buttons fire pointermove, one capture per pointer; zinc:ui fires a down per button, so each button now owns its capture (btnCap), the first left takes the moves when the main capture lets go. Chromium scroll_utils.h (https://sources.debian.org/src/chromium/138.0.7204.183-1/cc/input/scroll_utils.h): line step 40 px, page = max(view - 40, 0.875 view). CSS scroll anchoring (https://drafts.csswg.org/css-scroll-anchoring-1/) and FlatList maintainVisibleContentPosition: keep the first visible row in place. Flutter ScaleGestureRecognizer and Android ACTION_POINTER_UP recompute from remaining fingers; we follow Android's ACTION_UP: the pointer finger's lift ends the gesture and forgets the others.
What changed (lib/std/ui.ts): dropFingers() when the pointer finger lifts (touchAt and halTouches; the HAL picks the next new finger as pointer, as SDL's mouse emulation); per-button capture; Space/Enter keep `pressed` until key up (keyHeld), node onKeyUp (ui.onNodeKeyUp, JSX onKeyUp lowered in src/frontend/jsx.cpp to _keyUp in react/solid/kit host), ui.keyUp test hook; keyScroll (arrows/Space on a focused scroller, PageUp/PageDown/Home/End on the scroller the focus is in or under the pointer); ui.prependRows(list, n); selection autoscroll on a 50 ms timer while the pointer rests past a field's edge. react-native.tsx Press: Enter/Space keydown = press in, keyup = press out.
Decisions: Pressable's keyboard press lives in Press (node onKeyDown/onKeyUp) rather than firing pointer events from the keyboard (a slider's onPointerDown would jump); limit: a Pressable inside an ancestor with its own onKeyDown now takes keys first (the walk stops at the first handler). prependRows is explicit because rows are by index.
Proof: tests/t0/ui_input_edges.sh (golden tests/data/ui-input-edges/expected.out) passes; same output on interpreter, QuickJS and native. ui_gesture_state, ui_keyup, virtual_stick, virtual_rows pass. lib/ui.d.ts regenerated.
Later: callback refs (ref={(h) => ...}) refused by the checker (Z0103) on host elements; React accepts them. Static Text drag-select into an input, Cmd+A on static text and Text in overlay layers remain (ZN-917 line).
Proposed tests: tests/t1 Atelier and nuxt-ui sessions (keys now scroll), rn_showcase, a windowed touch session on a real touch screen (HAL path of dropFingers).
<!-- SECTION:NOTES:END -->
