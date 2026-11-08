---
id: ZN-1071
title: 'AppKit window chrome: Window, Toolbar, SplitView and Sidebar'
status: Backlog
assignee: []
created_date: '2026-11-08 21:43'
labels:
  - ui
  - appkit
  - desktop
  - size-M
milestone: m-31
dependencies:
  - ZN-1070
ordinal: 8020
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the window's content under SDL (keys, first responder, Tab loop); zinc:appkit Window, Toolbar, SplitView with Sidebar; nested Yoga roots that follow native pane and item sizes. Report: docs/reports/appkit-native-ui-research.md, D210.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc:appkit exports Window, Toolbar, SplitView and Sidebar with typed props, each with a drawn fallback where no native host runs
- [ ] #2 Tab and Shift-Tab move the first responder through the controls; keys reach the focused view
- [ ] #3 Resizing a split pane re-lays out its Yoga subtree
<!-- AC:END -->
