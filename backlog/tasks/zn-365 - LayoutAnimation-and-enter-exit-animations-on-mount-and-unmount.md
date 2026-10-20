---
id: ZN-365
title: LayoutAnimation and enter/exit animations on mount and unmount
status: Done
assignee: []
created_date: '2026-10-08 15:15'
updated_date: '2026-10-08 16:02'
labels:
  - ui
  - animation
  - rn
  - size-M
milestone: m-17
dependencies:
  - ZN-364
ordinal: 50070
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
React Native's LayoutAnimation.configureNext(presets: easeInEaseOut, linear, spring) animates the next layout change (positions and sizes interpolated, created and deleted nodes faded or scaled), and enter/exit animations of mounted and unmounted nodes (the Reanimated layout animations idea, kept to RN's limits).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 configureNext before a state change animates moved nodes between their old and new boxes (golden frames at 0, 50 and 100 %)
- [x] #2 removed nodes animate out before they leave the tree
- [x] #3 works in classic and rn layout modes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Done: LayoutAnimation in lib/std/ui.ts (configureNext with onEnd, Presets easeInEaseOut 300 / linear 500 / spring 700 with damping 0.4, create(), the shortcuts; curves iOS bezier, linear, damped spring settling at the end): a snapshot of the boxes before the layout, then each changed node interpolates its own absolute box (children follow), created nodes fade in (UiNode.fade multiplies the style opacity in paint), removed ones (ui.remove and clearChildren, so Show and For) stay as leaving nodes skipped by both layout engines and fade out, then leave. tests/t1/layout_anim.sh: boxes at 0/50/100 %, fade in, delayed removal, onEnd, identical in classic and rn. Found: function values are new objects at each read (ui.addStepper deduplicated nothing; worked around with stored function values in ui.ts and animated.ts, which also stops animated's stepper from staying registered forever) and an IR error with a debug accessor: ZN-376.
<!-- SECTION:NOTES:END -->
