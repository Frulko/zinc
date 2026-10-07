---
id: ZN-245
title: 'System: Linux D-Bus layer, notifications, power, idle'
status: Backlog
assignee: []
created_date: '2026-10-07 12:21'
updated_date: '2026-10-07 16:47'
labels:
  - system
  - linux
  - parked
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
parked 2026-10-07: the D-Bus layer (notifications, power, idle, tray host) needs a Linux session with a bus and a desktop to run; no Linux runner here yet (ZN-133 qemu-user is Linux-user mode, a bus needs a distro). Written code could not be tested. Resume when a Linux CI image or VM exists.
<!-- SECTION:NOTES:END -->
