---
id: ZN-388
title: 'classic: borders that take layout space under the react-native preset'
status: Backlog
assignee: []
created_date: '2026-10-08 22:30'
labels:
  - ui
  - layout
  - size-M
dependencies: []
ordinal: 16300
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-11-07):** Borders take layout space in classic with the preset (78c2d81a2, classic.pass grew by 54 cases). Left: the 13 border and box-sizing cases still listed in `tests/golden/layout-conformance/classic.known-fail` (absolute children inside a border, reverse rows and columns with an inner border, `box_sizing_border_box_comtaining_block`).

Follow-up of ZN-381: the rn engine sends border widths to Yoga as layout borders (React Native and CSS); classic still paints them without layout space, so a React Native screen with borderWidth lays out 1 px off per side in classic with the preset, and classic fails the corpus's border and box-sizing cases (classic.known-fail). Add the border widths to the padding the measure and place passes use when the preset is on (paint unchanged), and box-sizing content-box; keep plain classic unchanged (the 42 prototype entries).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 classic with the react-native preset passes the border and box-sizing cases of the corpus; proto-capture compare --all unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: done-partly. (corrected: done proposed; the core shipped (78c2d81a2) but 13 border and box-sizing cases are still in tests/golden/layout-conformance/classic.known-fail.)
<!-- SECTION:NOTES:END -->
