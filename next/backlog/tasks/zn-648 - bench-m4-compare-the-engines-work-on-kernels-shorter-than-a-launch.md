---
id: ZN-648
title: 'bench-m4: compare the engines'' work on kernels shorter than a launch'
status: Backlog
assignee: []
created_date: '2026-10-10 17:49'
labels:
  - perf
  - tools
  - size-S
milestone: m-21
dependencies: []
ordinal: 395400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
jsonout runs ~1 ms of work: interpreter 1.2-1.4 ms, AOT 1.0-1.3, QuickJS 0.9-1.4 (Intel Mac, ZN-592.05: each engine's run minus its run of an empty program, best of 40 interleaved). Its M4 threshold (TESTING.md: interpreter not slower than QuickJS on strings, jsonout and dynsum) therefore compares launches: zinc's interpreter starts in ~8.8 ms (a 12 MB engine importing ~350 libSystem symbols, ZN-592.03) against qjs's 6.0, and fails on that alone. Make tools/bench-m4 measure each engine's launch (an empty program of the same kind, interleaved) and report the work (median minus launch) beside the totals; judge the 'not slower' thresholds on the work for kernels shorter than 10x the launch, and say so in the table and in TESTING.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tools/bench-m4 prints launch and work per engine and judges jsonout on its work
- [ ] #2 TESTING.md's M4 row says how short kernels are judged
<!-- AC:END -->
