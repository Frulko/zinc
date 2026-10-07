---
id: ZN-248
title: 'System: T2 desktop verification harness and docs'
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
- [ ] #1 `ZINC_SYSTEM_SELFTEST` dumps the live state of every real macOS feature to JSON; `tests/t2/desktop.sh` runs a demo app, fires items with `performAction`, compares to goldens and takes `screencapture` references; skips cleanly without a GUI session.
- [ ] #2 Optional System Events check runs only when `AXIsProcessTrusted`; `docs/desktop-integration.md` lists the commands and the per-platform fallback table.
<!-- AC:END -->
