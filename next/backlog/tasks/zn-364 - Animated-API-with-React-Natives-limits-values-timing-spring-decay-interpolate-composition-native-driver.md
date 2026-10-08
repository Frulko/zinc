---
id: ZN-364
title: >-
  Animated API with React Native's limits: values, timing, spring, decay,
  interpolate, composition, native driver
status: Backlog
assignee: []
created_date: '2026-10-08 15:15'
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
- [ ] #1 each API has a test against React Native's documented values (timing curves, spring settle time, interpolate ranges)
- [ ] #2 a native-driver animation keeps running while the program's thread is blocked (test), and refuses a layout prop with RN's error text
- [ ] #3 an example screen in examples/rn-showcase uses Animated for the sheet and the switches instead of the per-frame easing
<!-- AC:END -->
