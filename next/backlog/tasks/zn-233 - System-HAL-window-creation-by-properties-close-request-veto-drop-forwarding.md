---
id: ZN-233
title: 'System: HAL window creation by properties, close-request veto, drop forwarding'
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
  - ZN-231
ordinal: 52030
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-04). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `hal_sdl.cpp` creates the window with properties from `app.window` (frameless, always-on-top, min size, position, transparent flag); defaults produce the same window as today (existing pixel goldens unchanged).
- [ ] #2 `hal_close_requested()` weak hook lets a handler cancel the quit; dropped files reach `system.on('drop')`.
- [ ] #3 Sim run logs the window creation request fields.
<!-- AC:END -->
