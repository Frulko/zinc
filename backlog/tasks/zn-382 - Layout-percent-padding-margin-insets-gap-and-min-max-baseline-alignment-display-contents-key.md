---
id: ZN-382
title: >-
  Layout: percent padding, margin, insets, gap and min/max; baseline alignment;
  display contents key
status: Done
assignee: []
created_date: '2026-10-08 19:00'
updated_date: '2026-10-08 22:40'
labels:
  - ui
  - layout
  - size-M
milestone: m-17
dependencies: []
ordinal: 142000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Gap from the conformance corpus (ZN-289): percent padding (3), margin (1), position (7), gap (9), min/max (9); alignItems / alignSelf 'baseline' (16); display 'contents' (9, the Contents layout prop exists). Add the keys and their mapping to Yoga; classic support where cheap, else documented as rn-only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 those cases run and pass in rn; the matrix in docs/reports/layout-conformance.md is regenerated
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: percent padding, margin, insets, gap / rowGap / columnGap and min/max as <key>Percent style keys (PROP 90-108; '10%' in object styles), sent to Yoga as LayoutProp + 2000 (its percent setters); classic ignores them (documented rn-only). alignItems / alignSelf baseline mapped; display 'contents' (hidden 2: classic flattens it like a fragment, Yoga gets Contents). Corpus 414 -> 482 expressible, rn 482/482, classic 274 -> 289 (no case lost); one case named a harness limit (percentage_flex_basis_main_min_width: Yoga itself gives 120/80 as a root and 128/72 nested, checked against the vendored Yoga). New golden tests/golden/layout-rn-pct in layout_rn.sh. tests/run --changed 47/47, proto-capture compare --all 42/42. usage: n/a
<!-- SECTION:NOTES:END -->
