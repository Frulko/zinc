---
id: ZN-245
title: 'System: Linux D-Bus layer, notifications, power, idle'
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
ordinal: 52150
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-16). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `dbus.cpp` loads libdbus-1 by dlopen with our own prototypes, builds and runs on `zig c++` and gcc, and degrades to `backend: 'none'` when the library or the bus is missing.
- [ ] #2 In the container with a mock Notifications server the `Notify` arguments equal the golden and `ActionInvoked` / `NotificationClosed` become TS events; `PrepareForSleep` becomes `suspend`/`resume`.
- [ ] #3 No new link dependency: `ldd` of `zinc` is unchanged.
<!-- AC:END -->
