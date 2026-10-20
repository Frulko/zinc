---
id: ZN-381
title: 'Layout: borders that take layout space, box-sizing, position static'
status: Done
assignee: []
created_date: '2026-10-08 18:59'
updated_date: '2026-10-08 22:30'
labels:
  - ui
  - layout
  - size-M
milestone: m-17
dependencies: []
ordinal: 141000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Gap from the conformance corpus (ZN-289): 76 cases set borders that take layout space (Yoga's YGNodeStyleSetBorder; zinc:ui paints borders only, layout-engines.md section 4 item 12), 5 box-sizing content-box, 40 position static. In rn mode, send borderWidth and the side widths to Yoga as layout borders (React Native's semantics); classic keeps paint-only borders unless the react-native preset is on; add position 'static' and boxSizing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the border, box-sizing and static position cases pass in rn; demos unchanged (proto-capture compare --all)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: rn sends borderWidth and the side widths to Yoga as layout borders (LayoutProp 32-35), position static (value 2, YGPositionTypeStatic; insets ignored under RN semantics; class static), boxSizing key and box-border / box-content classes (PROP and LayoutProp 89). Root-cause fix: unset insets go to Yoga as undefined, not auto (auto broke the static position of absolute nodes; reproduced against vendored Yoga). Corpus 323 -> 414 expressible, rn 414/414, classic 257 -> 274 (no case lost). rn goldens re-recorded (hero in rn, rn-showcase discover: borders now take space); proto-capture compare --all 42/42 unchanged; tests/run --changed 47/47. Classic with the preset keeps paint-only borders: ZN-388. usage: n/a
<!-- SECTION:NOTES:END -->
