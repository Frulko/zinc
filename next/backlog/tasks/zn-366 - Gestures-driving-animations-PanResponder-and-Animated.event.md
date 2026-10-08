---
id: ZN-366
title: 'Gestures driving animations: PanResponder and Animated.event'
status: Backlog
assignee: []
created_date: '2026-10-08 15:16'
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
- [ ] #1 a scripted drag (ui.pointerAt) moves a panned view and releases into a decay (test with recorded frames)
- [ ] #2 Animated.event on a ScrollView drives a header's opacity without program code per frame
- [ ] #3 the bottom sheet of rn-showcase is draggable
<!-- AC:END -->
