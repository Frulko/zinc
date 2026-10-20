---
id: ZN-232
title: >-
  System: `system` plugin skeleton, op table, recording simulator, scripted
  events
status: Done
assignee: []
created_date: '2026-10-07 12:21'
updated_date: '2026-10-07 15:36'
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
- [x] #1 `plugins/system` loads with `zinc:system` and `supports()`; `ops.json` generates TS typings and the permission gate; `system_ops.sh` fails on drift.
- [x] #2 With `ZINC_DETERMINISTIC=1` a program calling one op prints the exact `[system] op {json}` line; `ZINC_SYSTEM_SCRIPT` delivers an event at the stated frame to a TS handler, interpreter and AOT identical.
- [x] #3 A host call without the compiled permission is refused natively (test through the C driver).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. plugins/system: plugin.json (deterministic, zinc:system), ops.json (30 ops: permission, shapes, sim answer), tools/system-ops generates ops.d.ts and native/ops.gen.h, tests/t0/system_ops.sh is the drift guard; native/system.spec.ts (3 calls + setPermissions/supports/backend/onEvent), system.host.cpp (permission gate and recording simulator, ZINC_SYSTEM_LOG, ZINC_SYSTEM_SCRIPT per tick, C-style because zrt.h redefines placement new), index.ts (call, on, supports, backend, quit), synthetic module zinc:system/permissions bakes the zinc.json list. Goldens tests/golden/system/{basic,denied} on interpreter and AOT identical (tests/t1/system_sim.sh); the native gate is tested through the native ABI in tests/native/plugins_test.cpp (window:state vs window, denied tray). docs/plugins/system.md. Feature modules stay stubs until their tasks.
<!-- SECTION:NOTES:END -->
