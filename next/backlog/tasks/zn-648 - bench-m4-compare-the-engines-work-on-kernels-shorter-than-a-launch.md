---
id: ZN-648
title: 'bench-m4: compare the engines'' work on kernels shorter than a launch'
status: Done
assignee: []
created_date: '2026-10-10 17:49'
updated_date: '2026-10-10 17:58'
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
- [x] #1 tools/bench-m4 prints launch and work per engine and judges jsonout on its work
- [x] #2 TESTING.md's M4 row says how short kernels are judged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-10 (D69). tools/bench-m4: jsonout (named short: ~1 ms of work everywhere) is judged on its work: cycles of the kernel run minus cycles of an empty run of the same engine (/usr/bin/time -l on macOS, CPU time elsewhere), alternated, medians, max(runs, 11) x 2 pairs; a section 'Short kernels: launch and work' and launch_s / work_s in bench/m4.json. Tried first: wall time and CPU time, classifying short kernels by a measured launch: at load 7-15 the launches read 14-30 ms, dynsum and strings were taken for short, and the work swung (QuickJS 0.00 ms, interpreter ratios 0.73-1.00x): not usable while other trees build. Cycles agreed over two runs at load 8: interpreter 5.49-5.58M, AOT 3.87-4.61M, QuickJS 4.23-4.30M (a third run at load 10 inflated all). The threshold now reads 0.77x: a real loss of the interpreter's work, filed as ZN-654. TESTING.md's M4 row says how jsonout is judged.
usage: n/a
<!-- SECTION:NOTES:END -->
