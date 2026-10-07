---
id: ZN-239
title: 'System: Dialogs: SDL_DIALOG on, open/save/message/confirm, fs scope'
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
ordinal: 52090
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-10). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `SDL_DIALOG` switched on in CMake with the vendoring note updated; the engine still builds with clang and `zig c++`.
- [ ] #2 Sim answers from `dialog-answer`; unanswered resolves cancel; picked paths enter the `user-picked` scope and a read outside it is refused (test).
- [ ] #3 On macOS a hands-free check opens a dialog and dismisses it with `NSApp abortModal` in selftest; message dialog attaches as a sheet.
<!-- AC:END -->
