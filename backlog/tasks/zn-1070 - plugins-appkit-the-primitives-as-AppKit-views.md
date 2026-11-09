---
id: ZN-1070
title: 'plugins/appkit: the primitives as AppKit views'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-08 21:43'
labels:
  - ui
  - appkit
  - plugins
  - size-L
milestone: m-31
dependencies:
  - ZN-1069
ordinal: 8010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
View (flattened when layout-only), Text, Image, ScrollView, TextInput and TextArea, Pressable as AppKit views; events back through the host functions; system colours and dark mode; a tree dump for tests. Report: docs/reports/appkit-native-ui-research.md, D210.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A program using View, Text, Image, ScrollView, TextInput and Pressable shows real NSViews under render native on macOS
- [ ] #2 Clicks, text input and scrolling come back as the same events the drawn UI gives
- [ ] #3 Dark mode and system colours follow the system setting
- [ ] #4 zinc can dump the native tree; a T0 test checks the dump of a small program
<!-- AC:END -->
