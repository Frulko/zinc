---
id: ZN-377
title: >-
  zinc:ui: right-to-left direction and logical properties (ms-, ps-, start-,
  rtl:)
status: Done
assignee: []
created_date: '2026-10-08 18:48'
updated_date: '2026-10-08 21:50'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies: []
ordinal: 137000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Gap found by ZN-357.01 (docs/nuxt-ui.md): Nuxt UI writes logical properties (ms-, me-, ps-, pe-, start-, end-, rounded-s/e) and rtl: flips (Switch thumb, Tabs indicator); zinc:ui is LTR only (layout-engines.md section 4, item 14). Add a direction (dir prop / zinc.json / locale) that mirrors the main axis of rows, the logical classes and the rtl: variant, in both layout engines.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a row, padding-inline, a Switch and Tabs mirror under rtl (goldens) and LTR pixels are unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a
Done: zinc:ui direction for the surface (ui.setDirection / direction / isRtl, ZINC_DIR=rtl): classic rows run from the right edge, a column's start and its unstretched children sit on the right, text without an explicit alignment starts on the right (paint and caret); the rn engine gets YGDirectionRTL on the root (LayoutProp::Direction, inherited). Logical classes ms- me- ps- pe- start- end- rounded-s/e border-s/e text-start/end resolve to physical ones (restyled on a switch, media bit 32), rtl: / ltr: variants; the JSX class check knows them. Nuxt UI Switch thumb mirrors; React Native I18nManager (isRTL, forceRTL). Test tests/t1/rtl.sh: ltr and rtl boxes mirrored, rn equals classic, 2 frame hashes. LTR unchanged: tests/run --changed 47/47 (an allocation regression of the first version fixed: the table hoisted), proto-capture 4/4. Docs: docs/ui.md (Right to left), docs/nuxt-ui.md, docs/react-native.md.
Limits: one direction per surface (no per-subtree dir); absolute insets and physical classes stay physical; horizontal scroll still starts at the left.
<!-- SECTION:NOTES:END -->
