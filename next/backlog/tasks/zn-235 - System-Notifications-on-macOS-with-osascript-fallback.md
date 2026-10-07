---
id: ZN-235
title: 'System: Notifications on macOS with osascript fallback'
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
ordinal: 52050
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-06). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Sim golden covers show with actions/reply/group/replace, permission states, cancel, `delivered()`, click/action/reply/close events from the script.
- [ ] #2 On this Mac the bundled run delivers a notification (selftest readback shows id, title, body) and the `osascript` tier works unbundled with `backend: 'osascript'`.
- [ ] #3 A denied permission resolves `delivered: false` with a reason, never throws.
<!-- AC:END -->
