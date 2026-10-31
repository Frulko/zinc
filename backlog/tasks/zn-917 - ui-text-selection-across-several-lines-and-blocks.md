---
id: ZN-917
title: 'ui: text selection across several lines and blocks'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-31 08:40'
labels:
  - discord
  - ui
dependencies: []
ordinal: 611460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-31: the engine's text selection works line by line only; dragging across several lines or several Text nodes must select them all, highlight, and copy with newlines.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Drag selection spans several lines of one Text and several Text blocks in a ScrollView, with highlight and copy
- [ ] #2 Test on every engine; works in Discord messages
<!-- AC:END -->
