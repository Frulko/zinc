---
id: ZN-1072
title: AppKit Table and Outline with row recycling
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-08 21:43'
labels:
  - ui
  - appkit
  - size-M
milestone: m-31
dependencies:
  - ZN-1070
ordinal: 8030
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
NSTableView and NSOutlineView components with columns, sorting, selection, type-select and cell recycling, answered from a cache of the visible rows pushed with each commit. Report: docs/reports/appkit-native-ui-research.md, D210.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Table shows 10,000 rows with columns, sorting and selection, scrolling without building every row
- [ ] #2 Outline expands and collapses a tree; type-select jumps to a row
- [ ] #3 Both have a drawn fallback on targets without the native host
<!-- AC:END -->
