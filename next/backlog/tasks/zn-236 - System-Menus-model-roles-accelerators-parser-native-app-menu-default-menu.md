---
id: ZN-236
title: >-
  System: Menus: model, roles, accelerators, parser, native app menu, default
  menu
status: Backlog
assignee: []
created_date: '2026-10-07 12:21'
labels:
  - system
  - desktop
  - plugins
  - size-L
milestone: m-16
dependencies:
  - ZN-232
  - ZN-233
ordinal: 52060
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-07). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The accelerator parser and role table are shared TS code with 30+ unit cases (CmdOrCtrl, Plus, F-keys, invalid input).
- [ ] #2 macOS selftest dump of `NSApp.mainMenu` equals the golden for the template of section 4.3; `performAction` on an item reaches `menu.onClick` once; edit roles produce `role:*` events and the hero example's text fields still copy/paste (S6).
- [ ] #3 `menu.default()` applies when the app sets none, with the app name from the manifest.
<!-- AC:END -->
