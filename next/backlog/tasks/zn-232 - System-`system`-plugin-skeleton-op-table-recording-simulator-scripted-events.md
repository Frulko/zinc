---
id: ZN-232
title: >-
  System: `system` plugin skeleton, op table, recording simulator, scripted
  events
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
  - ZN-230
  - ZN-231
ordinal: 52020
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-03). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `plugins/system` loads with `zinc:system` and `supports()`; `ops.json` generates TS typings and the permission gate; `system_ops.sh` fails on drift.
- [ ] #2 With `ZINC_DETERMINISTIC=1` a program calling one op prints the exact `[system] op {json}` line; `ZINC_SYSTEM_SCRIPT` delivers an event at the stated frame to a TS handler, interpreter and AOT identical.
- [ ] #3 A host call without the compiled permission is refused natively (test through the C driver).
<!-- AC:END -->
