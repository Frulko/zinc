---
id: ZN-242
title: 'System: Single instance and autostart'
status: Done
assignee: []
created_date: '2026-10-07 12:21'
updated_date: '2026-10-07 16:40'
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
- [x] #1 `instance.lock` with flock + libuv pipe: a second process delivers `{argv, cwd}` to the first and exits 0 (T1 test with two processes); a stale socket is recovered.
- [x] #2 `autostart` writes/removes the LaunchAgent or calls `SMAppService`, and the XDG `.desktop` on Linux; enable/disable/isEnabled covered with a temporary `HOME`.
- [x] #3 Sim logs the ops; the real macOS path is verified with `launchctl print`/file readback in a temp HOME.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. instance.ts + autostart.ts over ops instance.lock/autostart.set/get; portable POSIX in system.host.cpp: flock on <id>.lock and a listening AF_UNIX socket <id>.sock in $ZINC_SYSTEM_RUNTIME_DIR|$TMPDIR; a later process finds the lock held, sends {cwd, argv} to the socket and gets first:false (the app exits 0); the first delivers a second-instance event (cwd, argv...) and stays alive while listening; a socket left by a killed process is unlinked and rebound. Autostart: LaunchAgent plist (RunAtLoad, ProgramArguments, --hidden) under $HOME/Library/LaunchAgents on macOS, XDG .desktop under ~/.config/autostart elsewhere, readback and removal with a temporary HOME. tests/t1/system_instance.sh: two real processes, hard kill + recovery, plutil -lint of the plist. SMAppService/launchctl bootstrap are not used: the plist is written, loading it happens at the next login.
<!-- SECTION:NOTES:END -->
