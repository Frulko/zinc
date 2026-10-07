---
id: ZN-246
title: 'System: Linux StatusNotifierItem tray with dbusmenu and Unity badge'
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
  - ZN-245
  - ZN-238
ordinal: 52160
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-17). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 With a mock watcher/host the item exposes `IconPixmap`, `ToolTip`, `Menu`; `GetLayout` equals the model; `Activate`, `SecondaryActivate`, `ContextMenu` become tray events; dbusmenu `Event` becomes a menu click.
- [ ] #2 Without a watcher `tray.isAvailable()` is false and the app keeps running.
- [ ] #3 Badge and progress emit the `com.canonical.Unity.LauncherEntry` signal with the app's `.desktop` URI.
<!-- AC:END -->
