---
id: ZN-719
title: >-
  zinc run picks the QuickJS engine for a JavaScript project and honours its
  window size
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-11 16:10'
labels:
  - cli
  - js
  - size-S
milestone: m-13
dependencies: []
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc run on a project or file whose entry is .js or .mjs runs on QuickJS without --engine quickjs; zinc.json may name the engine
- [ ] #2 the window size of zinc.json is honoured under --engine quickjs; the four examples/js-* open at their size with a plain zinc run
- [ ] #3 a test for both; the READMEs of examples/js-* lose the flag
<!-- AC:END -->
