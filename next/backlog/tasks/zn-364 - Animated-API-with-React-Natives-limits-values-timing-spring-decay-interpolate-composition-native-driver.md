---
id: ZN-364
title: >-
  Animated API with React Native's limits: values, timing, spring, decay,
  interpolate, composition, native driver
status: Done
assignee: []
created_date: '2026-10-08 15:15'
updated_date: '2026-10-08 15:51'
labels:
  - ui
  - animation
  - rn
  - size-L
milestone: m-17
dependencies: []
ordinal: 50060
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-08: UI animation with the same limits as React Native. zinc:ui gains Animated.Value / ValueXY, Animated.timing (Easing), spring (stiffness/damping/mass and bounciness/speed), decay, interpolate (input/output ranges, extrapolate, colours), add/multiply/diffClamp, sequence/parallel/stagger/delay/loop, and Animated components (Animated.View, Animated.Text, Animated.Image) whose style takes animated values. useNativeDriver: true allows only transform and opacity (as in RN) and runs the animation in the engine's frame loop without the program's code per frame (the property slots of R5.3); other props run from the program. Same API in Solid and React renderers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 each API has a test against React Native's documented values (timing curves, spring settle time, interpolate ranges)
- [x] #2 an example screen in examples/rn-showcase uses Animated for the sheet and the switches instead of the per-frame easing
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Done: lib/std/animated.ts (zinc:ui/animated): Value/ValueXY as signals, timing, spring (three config forms), decay, interpolate (numeric and colours, extrapolation modes), arithmetic nodes, diffClamp, sequence/parallel/stagger/delay/loop, Easing (all of React Native's), ported from React Native 0.76 (MIT, attribution in the file). Driven by a per-frame stepper hook added to lib/std/ui.ts (addStepper/removeStepper, run by frame() and tick(); frames are not kept while one runs). tests/t1/animated.sh: references computed by Node from React Native's own sources (flow-remove-types 2.250.0 on Easing.js, bezier.js, SpringConfig.js; the closed forms of SpringAnimation.onUpdate copied verbatim): every series within 1e-6. rn-showcase's switches, sheet and scheme knob now use A.spring / A.timing instead of per-frame easing (hashes unchanged). Found and fixed on the way (7865b6e6): a static method used as a function value broke the IR, and two functions joined by a ternary failed the ZBC verifier (plain functions too). Native driver split to ZN-364.01 (needs ZN-191).
<!-- SECTION:NOTES:END -->
