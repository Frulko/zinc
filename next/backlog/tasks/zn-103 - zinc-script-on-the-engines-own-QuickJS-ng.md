---
id: ZN-103
title: 'zinc:script on the engine''s own QuickJS-ng'
status: Backlog
assignee: []
created_date: '2026-10-06 22:55'
labels:
  - plugins
  - size-M
milestone: m-9
dependencies:
  - ZN-101
  - ZN-061
ordinal: 40450
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rebase the script plugin on next/src/qjs (one vendored QuickJS, decision D10): eval, call, function handles, Dyn crossing as a snapshot, memory/time limits and the interrupt handler through QuickJS hooks, module loading, promises pumped per entry as the prototype's quickjs.host.cpp does; plugins/script/vendor/quickjs is no longer used by next.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tests/conformance script_basic.ts, script_async.ts pass; time and memory limit tests
- [ ] #2 examples/scripting/{bench,breakout-mods,playground} run headless
<!-- AC:END -->
