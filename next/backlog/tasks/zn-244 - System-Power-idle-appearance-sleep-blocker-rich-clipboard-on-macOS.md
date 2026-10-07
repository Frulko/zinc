---
id: ZN-244
title: 'System: Power, idle, appearance, sleep blocker, rich clipboard on macOS'
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
ordinal: 52140
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-15). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `SDL_POWER` switched on; `power.battery()` returns SDL's values; suspend/resume/lock events come from `NSWorkspace` notifications posted in selftest and from the script.
- [ ] #2 `preventSleep` creates and releases an IOKit assertion (checked with `pmset -g assertions`); dark/light event follows `SDL_EVENT_SYSTEM_THEME_CHANGED`.
- [ ] #3 Clipboard image and file-list round trip through NSPasteboard in selftest; text path through the HAL is unchanged.
<!-- AC:END -->
