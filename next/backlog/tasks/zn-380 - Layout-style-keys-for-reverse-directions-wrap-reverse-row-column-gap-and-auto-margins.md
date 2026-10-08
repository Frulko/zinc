---
id: ZN-380
title: >-
  Layout: style keys for reverse directions, wrap-reverse, row/column gap and
  auto margins
status: Backlog
assignee: []
created_date: '2026-10-08 18:59'
labels:
  - ui
  - layout
  - size-M
milestone: m-17
dependencies: []
ordinal: 140000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Gap from the conformance corpus (ZN-289, docs/reports/layout-conformance.md): 60 cases need row-reverse / column-reverse, 10 wrap-reverse, 24 rowGap / columnGap, 24 auto margins. zinc:ui has the fields (n.reverse, gapX / gapY, mAuto, used by classes) but no object style keys; Yoga has them all. Add flexDirection 'row-reverse' / 'column-reverse', flexWrap 'wrap-reverse', rowGap / columnGap, margin 'auto' as keys, mapped in both engines; regenerate cases.json (tools/layout-fixtures) so those cases count.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the cases of these features run and pass in rn; classic's new passes join classic.pass
<!-- AC:END -->
