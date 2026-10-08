---
id: ZN-366
title: 'Gestures driving animations: PanResponder and Animated.event'
status: Done
assignee: []
created_date: '2026-10-08 15:16'
updated_date: '2026-10-08 18:07'
labels:
  - ui
  - animation
  - rn
  - input
  - size-M
milestone: m-17
dependencies:
  - ZN-364
ordinal: 50080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
React Native's PanResponder (grant, move with dx/dy/vx/vy, release, terminate) and Animated.event mapping gesture and scroll values to animated values (native driver for scroll offsets), so a sheet follows the finger and flings with decay.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a scripted drag (ui.pointerAt) moves a panned view and releases into a decay (test with recorded frames)
- [x] #2 Animated.event on a ScrollView drives a header's opacity without program code per frame
- [x] #3 the bottom sheet of rn-showcase is draggable
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a
Done: zinc:ui PanResponder (create, panHandlers over onDrag: grant / move / release / terminate, gestureState dx dy vx vy moveX moveY x0 y0 stateID), React Native event shapes (ResponderEvent.nativeEvent: contentOffset, locationX/Y, pageX/Y, timestamp), onScroll on any scroll node (fired once per frame the offset moved); zinc:ui/animated event(mapping, { listener }) for both, ValueXY.extractOffset. jsx.cpp: {...x} attribute lowers to _spread (a PanHandlers attaches itself; components refuse it), onScroll to _scroll; both imported only when used (kit/host.ts untouched). Tests: tests/t1/pan_responder.sh (scripted drag x 20->110, release vx 0.900 px/ms, decay stops at +90, header opacity 1.00/0.50/0.00 from onScroll), rn_showcase.sh (SHOWCASE_DRAG=30 springs back, 200 closes; mid-drag 0.92 / 0.48), hashes unchanged. tests/run --changed 37/37, proto-capture 4/4.
Limits: the should-set callbacks are asked once when the drag takes the pointer; QuickJS does not run JSX so the golden is interpreter-only; the scroll native driver still runs through signals (ZN-364.01).
<!-- SECTION:NOTES:END -->
