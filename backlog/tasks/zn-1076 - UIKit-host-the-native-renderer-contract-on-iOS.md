---
id: ZN-1076
title: 'UIKit host: the native renderer contract on iOS'
status: Backlog
assignee: []
created_date: '2026-11-08 21:44'
labels:
  - ui
  - appkit
  - ios
  - size-L
milestone: m-26
dependencies:
  - ZN-1069
  - ZN-1070
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The same native host contract on iOS with the shared component names, through zinc export --target ios. Cross-platform pass. Report: docs/reports/appkit-native-ui-research.md section 11, D210.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The primitives and the shared zinc:appkit components that make sense on iOS map to UIKit views
- [ ] #2 zinc export --target ios builds an app that uses the native renderer
- [ ] #3 The drawn UI stays the fallback
<!-- AC:END -->
