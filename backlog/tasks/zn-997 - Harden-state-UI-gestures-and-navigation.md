---
id: ZN-997
title: 'Harden state: UI gestures and navigation'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-06 07:48'
updated_date: '2026-11-06 07:56'
labels:
  - size-M
  - ui
  - hardening
dependencies: []
ordinal: 756080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/implicit-state-machines.md (lib/std section: ui.ts gestures, navigation.tsx, react-native.tsx, kit/keyboard, kit/imageviewer). Reproduce each case first; drop what does not reproduce.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ui.ts: releaseAt early returns and a non-primary button release leave no press/drag state set; a release while the app is in the background is seen; regression test
- [x] #2 ui.ts: lifting the second finger of a pinch first gives pan and scroll back to the remaining finger; regression test
- [x] #3 navigation.tsx: push/pop/swipe/backstart during a transition finish or cancel it cleanly; Presented.close twice pops only the modal; regression test
- [x] #4 react-native.tsx Press releases (onPressOut) on a tap whose down and up land in one frame; Alert close runs once; regression test
- [x] #5 kit/keyboard.tsx stops key repeat and the accent popup on pointer cancel or leave; kit/imageviewer.ts ignores gestures while closing
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Each case reproduced first with the smallest program (failing outputs on develop d32ee81d6 kept in tests/t0/ui_gesture_state.sh, which fails on all 8 cases without the fixes).

- #1 ui.ts: the longDone early return of releaseAt ran before the capture's onPointerUp: a long press (word selection) in a field with onPointerDown lost its up and kept the capture. Moved after the PUP. A non-primary button release did NOT reproduce: a right or middle press sets only the capture, which its own release clears (the right click in background.ts proves it). Background: systemSignal('background') now cancels the press under way (cancelPress: onPointerCancel to the capture, drag phase 3, pinch end, no click/tap, scroll inertia kept, held and fingers cleared), as iOS touchesCancelled; before, a press spanning the background clicked on return.
- #2 ui.ts: second finger of a pinch lifted first left grabKind 3 (pan frozen, dragScroller cleared). regrab() restarts arbitration for the pointer finger where it is (no tap or long press after).
- #3 navigation.tsx: swipe and backstart are ignored while a pop runs (it finishes, the route goes); push clears predictive/edge; Presented.close pops only when the modal it was asked for is still on top (sheet drag + back in one frame popped the screen under it).
- #4 react-native.tsx: Press keeps the pressed state in a ref for its up (same-frame down/up missed onPressOut); AlertBox.closed makes close and the button press run once.
- #5 kit/keyboard.tsx: onPointerCancel cancels repeat, bubble and accent popup; onPointerLeave cancels only a held backspace (a finger sliding off a letter goes to the accent popup on purpose). kit/imageviewer.ts: wheel, pinch, drag, toggle and keys ignored while closing (the 165 ms paging window left as is).

Tests: ui_gesture_state (new, T0), ui_throw_state, and T1 navigation react_native_input ui_kbd_mode viewer_lifetime kit_tooltip kit_zoomview scroll_end text_touch touch_spread ui_media ios_text_edits: all pass.
<!-- SECTION:NOTES:END -->
