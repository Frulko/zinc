---
id: ZN-963
title: >-
  Hamlet: engine: a writable per-app data directory in zinc:fs (verify, then
  fix)
status: Backlog
assignee: []
created_date: '2026-11-01 13:07'
labels:
  - hamlet
  - demo
  - m2
  - engine
  - fs
  - size-S
milestone: m-30
dependencies: []
ordinal: 720040
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The reuse study found no app-data path in lib/modules.d.ts. Verify; if missing, add fs.appDataDir() on host targets with a test (AGENTS.md: fill engine gaps, no hard-coded path). See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Written down whether the API exists; if not, fs.appDataDir(appName) returns a writable directory on macOS/Linux/Windows (host only now)
- [ ] #2 T0 test writes, reads and removes a file in it on the 3 engines
- [ ] #3 docs/plugins or reference doc updated; CHANGELOG line if user visible
<!-- AC:END -->
