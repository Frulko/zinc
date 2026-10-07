---
id: ZN-242
title: 'System: Single instance and autostart'
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
  - ZN-232
  - ZN-234
ordinal: 52120
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-13). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `instance.lock` with flock + libuv pipe: a second process delivers `{argv, cwd}` to the first and exits 0 (T1 test with two processes); a stale socket is recovered.
- [ ] #2 `autostart` writes/removes the LaunchAgent or calls `SMAppService`, and the XDG `.desktop` on Linux; enable/disable/isEnabled covered with a temporary `HOME`.
- [ ] #3 Sim logs the ops; the real macOS path is verified with `launchctl print`/file readback in a temp HOME.
<!-- AC:END -->
