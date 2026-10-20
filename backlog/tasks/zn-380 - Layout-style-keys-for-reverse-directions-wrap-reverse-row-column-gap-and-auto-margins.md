---
id: ZN-380
title: >-
  Layout: style keys for reverse directions, wrap-reverse, row/column gap and
  auto margins
status: Done
assignee: []
created_date: '2026-10-08 18:59'
updated_date: '2026-10-08 22:19'
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
- [x] #1 the cases of these features run and pass in rn; classic's new passes join classic.pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: style keys flexDirection row-reverse (3) / column-reverse (2), flexWrap wrap-reverse (2), rowGap / columnGap (PROP 86, 87), margin* 'auto' (marginAuto bits, PROP 88; duplicate keys OR'd in setStyles), class flex-wrap-reverse. Yoga: wrap-reverse, auto margins (UNSET margin = auto; class ml-auto now reaches Yoga too). classic: wrap-reverse mirrors the cross axis. React Native's default position relative under RN semantics (insets shift without position). tools/layout-fixtures maps them: corpus 227 -> 323 expressible, rn 323/323, classic 190 -> 257 (no case lost; 29 new cases known-fail in classic: overflow under padding, absolute children of reversed containers). layout-compat golden extended (same boxes in classic and Yoga). Fixed the codec_test link (zn_res needs zn_rt for zn::uni); native_plugins_test link failure is older, ZN-387. tests/run --changed 47/47, proto-capture 4/4. usage: n/a
<!-- SECTION:NOTES:END -->
