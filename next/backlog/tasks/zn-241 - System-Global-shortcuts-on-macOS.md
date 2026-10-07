---
id: ZN-241
title: 'System: Global shortcuts on macOS'
status: Backlog
assignee: []
created_date: '2026-10-07 12:21'
labels:
  - system
  - desktop
  - plugins
  - size-S
milestone: m-16
dependencies:
  - ZN-232
  - ZN-236
ordinal: 52110
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-12). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The shared accelerator parser feeds `RegisterEventHotKey`; `register` returns `ok`/`conflict`/`unsupported`; unregister frees the hotkey.
- [ ] #2 Sim script fires the callback; live selftest posts the hotkey event and the callback runs once; no Accessibility prompt appears.
<!-- AC:END -->
