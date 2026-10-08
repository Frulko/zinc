---
id: ZN-257
title: >-
  UI style: Border model: dashed/dotted, per-side colour, per-corner radius,
  border in layout (`box-border-layout`)
status: Review
assignee: []
created_date: '2026-10-07 12:56'
updated_date: '2026-10-08 06:22'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-174
ordinal: 50570
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-08). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Goldens: dashed, dotted, four colours, four radii, on SW f32 and GL within tier tolerance.
- [ ] #2 esp32 profile: dashed becomes solid and radii the largest corner, with one log line (test).
- [x] #3 Presets `border`, `border-2`, `rounded-*` bit-exact with the old path.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. border-dashed / dotted / solid, border-t|r|b|l|x|y-<colour> (a colour per side), rounded-t|r|b|l|tl|tr|br|bl[-size] (a radius per corner; the background of such a box is a polygon with arcs). The extended border is drawn by paintBorderExt: the centre line of the border as four side polylines from the middle of one corner arc to the middle of the next, each stroked with its own colour and width, dash pattern (dashed: 3w on, 2w off; dotted: w on, w off) along it. The plain border, rounded-* and border-N presets keep the old drawing (border()/rrect()): AC3 holds, all earlier scene hashes and the 4-entry canary unchanged. rounded-x-lg and other malformed radii are now refused (a NaN radius used to be accepted). Tests: scene border-ext checked on the image (dashed, dotted with radius, four colours, tl+br, top corners, dashed with two corners), token fields in tests/golden/ui-tokens, the JSX grammar kept equal. NOT done: AC1 (the GL tier tolerance: the GL display is not in this tree yet) and AC2 (esp32 degradation with a log line belongs to ZN-278, style capability levels); border in layout (box-border-layout); dashed borders ignore their corners' arcs only at the side joins (each side restarts its dash).
<!-- SECTION:NOTES:END -->
