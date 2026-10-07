---
id: ZN-237
title: 'System: Context menu popup and dock menu/badge/bounce/progress on macOS'
status: Backlog
assignee: []
created_date: '2026-10-07 12:21'
labels:
  - system
  - desktop
  - plugins
  - size-M
milestone: m-16
dependencies:
  - ZN-236
ordinal: 52070
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-08). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `menu.popup` resolves with the id from the script in the sim and from `performAction` in selftest; frames keep running or the stall is measured and recorded (S7).
- [ ] #2 Dock badge readback equals the set string; dock menu items fire `menu` events with `source: 'dock'`.
<!-- AC:END -->
