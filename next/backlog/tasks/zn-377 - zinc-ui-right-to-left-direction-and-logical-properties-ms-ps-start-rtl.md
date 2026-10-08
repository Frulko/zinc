---
id: ZN-377
title: >-
  zinc:ui: right-to-left direction and logical properties (ms-, ps-, start-,
  rtl:)
status: Backlog
assignee: []
created_date: '2026-10-08 18:48'
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
- [ ] #1 a row, padding-inline, a Switch and Tabs mirror under rtl (goldens) and LTR pixels are unchanged
<!-- AC:END -->
