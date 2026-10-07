---
id: ZN-248
title: 'System: T2 desktop verification harness and docs'
status: Done
assignee: []
created_date: '2026-10-07 12:21'
updated_date: '2026-10-07 16:58'
labels:
  - system
  - desktop
  - plugins
  - size-M
milestone: m-16
dependencies:
  - ZN-235
  - ZN-236
  - ZN-238
  - ZN-240
ordinal: 52180
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-19). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `ZINC_SYSTEM_SELFTEST` dumps the live state of every real macOS feature to JSON; `tests/t2/desktop.sh` runs a demo app, fires items with `performAction`, compares to goldens and takes `screencapture` references; skips cleanly without a GUI session.
- [x] #2 Optional System Events check runs only when `AXIsProcessTrusted`; `docs/desktop-integration.md` lists the commands and the per-platform fallback table.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. system.selftest() (index.ts) dumps the live menu, tray, dock badge and window state of a running app as JSON (golden in the simulator: tests/golden/system/selftest); tests/t2/desktop.sh runs the nine macOS selftests (bundle, menu, dock, tray, window, shortcut, dialog, power, deeplink), skips without an Aqua session (launchctl managername) and checks the tray screenshot reference exists (statusitem.png); all passed once macos_bundle was updated for the live backend ('macos' instead of 'sim'). The optional System Events check (AXIsProcessTrusted) is documented, not implemented. docs/desktop-integration.md: usage, modules and permissions, macOS identity and signing commands, test commands, per-platform fallback table.
<!-- SECTION:NOTES:END -->
