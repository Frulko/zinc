---
id: ZN-771
title: Trackpad and Magic Mouse scrolling follows the macOS momentum
status: Review
assignee: []
created_date: '2026-10-20 12:00'
updated_date: '2026-10-20 12:00'
labels:
  - ui
milestone: m-21
dependencies: []
priority: high
ordinal: 5102
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner (2026-10-20): scrolling in zinc:ui scroll views (examples/agents' conversation list and chat) should feel like macOS: pixel-precise and with the velocity a trackpad or a Magic Mouse gives. Before: SDL's momentum hint was off and the engine ran its own inertia from the release velocity, with the lift known from trackpad touches or a 50 ms gap; a Magic Mouse has no touches, so either every frame was a lift (a MacBook, whose trackpad was seen) or the release came 50 ms after the last delta, past the 40 ms rest rule: the velocity was 0 and there was no momentum at all. examples/agents also called ui.scrollTo when older items loaded, which dropped any running scroll.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 fractional precise deltas move a scroll view 1:1 every frame (scroll_momentum)
- [x] #2 after the lift the OS momentum's deltas are followed as they come, with no inertia of the engine added, and fingers landing stop it (scroll_momentum)
- [x] #3 a momentum that reaches the end bounces and rests on the end (scroll_momentum)
- [x] #4 a notched wheel still eases 48 px per notch, and jumps with reduced motion (scroll_momentum)
- [ ] #5 the feel on a real trackpad and Magic Mouse is checked by a person (build/zinc run examples/agents)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
targets/macos/hal_cocoa.mm: an NSEvent local monitor takes the main window's precise scrolls that carry a phase (trackpad, Magic Mouse) with scrollingDeltaX/Y, phase and momentumPhase, and keeps them from SDL; notched wheels, precise devices without phases and the other windows still go through SDL. targets/macos/hal_sdl.cpp: SDL_HINT_MAC_SCROLL_MOMENTUM on when that stream exists; the resampler is shared, new phases 4 (lift, the OS momentum follows) and 5 (its deltas); MayBegin is phase 3; 100 ms without momentum after a lift ends the stream; Reduce motion is signalled at start. lib/std/ui.ts: ScrollAxis mode MOMENTUM (momentumBy: 1:1, an edge hands the velocity to the bounce and drops the rest; rests 100 ms after the last delta), wheel easing jumps with reduceMotion, ui.scrollBy keeps a running scroll; examples/agents keepPlace uses it. ZINC_INPUT `scroll DX DY PHASE` injects HalInput.scroll_*. Nested scroll views unchanged: the innermost that scrolls that way takes the gesture and its momentum, rubber-bands at its end, no hand-over. Not checked on a device: no trackpad here (criterion 5).
<!-- SECTION:NOTES:END -->
