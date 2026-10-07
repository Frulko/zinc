---
id: ZN-239
title: 'System: Dialogs: SDL_DIALOG on, open/save/message/confirm, fs scope'
status: Review
assignee: []
created_date: '2026-10-07 12:21'
updated_date: '2026-10-07 16:23'
labels:
  - system
  - desktop
  - plugins
  - size-M
milestone: m-16
dependencies:
  - ZN-232
ordinal: 52090
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-10). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `SDL_DIALOG` switched on in CMake with the vendoring note updated; the engine still builds with clang and `zig c++`.
- [x] #2 Sim answers from `dialog-answer`; unanswered resolves cancel; picked paths enter the `user-picked` scope and a read outside it is refused (test).
- [ ] #3 On macOS a hands-free check opens a dialog and dismisses it with `NSApp abortModal` in selftest; message dialog attaches as a sheet.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. dialog.ts (open, save, message, confirm; OpenOptions/SaveOptions/MessageOptions/Filter), sim answers from dialog-answer (queued at script read), unanswered = cancel (null, -1, confirm false), picked paths granted to the fs scope; the fs scope is enforced in the host (src/host/sys_host.cpp: zn_host_fs_scope/zn_host_fs_grant, read/write/append/list-count/remove/mkdir refused outside the grants with 'outside the fs scope') and switched on by zinc.json scopes {fs: user-picked} through the plugin (setScopes, baked zinc:system/app SCOPES). Golden tests/golden/system/dialog: read before picking refused, read after picking ok, other file refused. macOS: NSOpenPanel/NSSavePanel/NSAlert modal, abortMs test hook arms NSApp abortModal: tests/golden/macos/dialog opens all three for real and they end by themselves (tests/t1/macos_dialog.sh). AC1 not done on purpose: D27 chose NSOpenPanel directly over SDL_DIALOG (main-thread and sheet attachment), so SDL_DIALOG stays off. AC3 half: no sheet attachment (runModal).
<!-- SECTION:NOTES:END -->
