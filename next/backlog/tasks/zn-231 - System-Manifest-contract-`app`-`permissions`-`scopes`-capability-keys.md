---
id: ZN-231
title: 'System: Manifest contract: `app`, `permissions`, `scopes`, capability keys'
status: Backlog
assignee: []
created_date: '2026-10-07 12:21'
labels:
  - system
  - desktop
  - plugins
  - size-M
milestone: m-16
dependencies: []
ordinal: 52010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-02). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc.json accepts `app{id,name,version,icon,dock,urlSchemes,fileTypes,window}`, `permissions` with `-` per-target removal and `scopes`; a bad id or an unknown permission is a diagnostic with the line.
- [ ] #2 `targets/capabilities.json` has the section 5.2 keys; a build for esp32 of an app that imports `zinc:system/tray` succeeds and resolves to the stub; with `"requires": ["tray"]` it fails with the capability message.
- [ ] #3 Importing a system module without its permission fails at compile time naming the permission id (golden diagnostic).
<!-- AC:END -->
