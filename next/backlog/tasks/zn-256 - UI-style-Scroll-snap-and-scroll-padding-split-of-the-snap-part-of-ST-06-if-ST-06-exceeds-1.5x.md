---
id: ZN-256
title: >-
  UI style: Scroll snap and scroll padding (split of the snap part of ST-06 if
  ST-06 exceeds 1.5x)
status: Done
assignee: []
created_date: '2026-10-07 12:56'
updated_date: '2026-10-08 06:18'
labels:
  - ui
  - style
  - size-S
milestone: m-17
dependencies:
  - ZN-255
ordinal: 50560
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-07). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Wheel notch and touch fling end on snap points.
- [x] #2 `scroll_physics.tsx` conformance output unchanged without snap props.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. snap-x / snap-y / snap-both / snap-none, snap-mandatory (default) / snap-proximity (within 32 px), children snap-start / snap-center / snap-end / snap-align-none, scroll-p-N / -pt / -pb / -pl / -pr / -px / -py. The snap points are collected from the descendants of the container each time (offsets that put the child at the start, centre or end of the padded viewport); a wheel notch moves to the next point in its direction, a scroll that stops between two (inertia ended, release without velocity) settles on the nearest through the existing wheel spring. Test: tests/golden/ui-snap (notch, notch, notch back, scrollTo(130) settles on 96; deterministic with the frame clock; run in t1/ui_tokens.sh); token fields in tests/golden/ui-tokens; scroll_physics conformance output identical without snap props; canary and all scene hashes unchanged. Not tested separately: a touch fling (it ends in the same inertia-to-idle path that settles).
<!-- SECTION:NOTES:END -->
