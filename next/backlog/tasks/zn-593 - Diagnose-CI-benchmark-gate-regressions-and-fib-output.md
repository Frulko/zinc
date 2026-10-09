---
id: ZN-593
title: 'Diagnose CI benchmark gate regressions and fib output'
status: Backlog
assignee: []
created_date: '2026-10-09 12:30'
labels:
  - ci
  - perf
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After build repairs in `8c67fb5d`, [run 37910130342, bench-gate job](https://github.com/Frulko/zinc/actions/runs/37910130342/job/113753015873) completes the macOS build and fails in `tools/bench-gate` with exit 3.

The log reports regressions against previous time/QuickJS ratios: fib AOT +107%, nbody interpreter +122%, nbody AOT +52%, sort interpreter +16%, strings interpreter +62%, strings AOT +44%. It also reports `fib: interp did not run or printed a different output`.

Reproduce on the tested revision and separate correctness failures from machine/load effects in the relative measurements. Existing build checks do not establish that the benchmark gate passes. Windows also fails in this run, but its parked experimental port is outside this task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->
- [ ] #1 Capture fib interpreter exit status, stdout and stderr on the tested revision; fix the cause of the mismatch with a focused regression test.
- [ ] #2 Explain each ratio regression using repeatable measurements on comparable runner hardware and record the evidence; do not silently relax the threshold or overwrite the baseline.
- [ ] #3 The benchmark gate passes on a fresh GitHub run, or a reviewed measurement correction explains and fixes the runner mismatch while retaining meaningful regression detection.
- [ ] #4 Keep any runtime fix separate from benchmark measurement changes and run the relevant focused tests plus `next/tests/run --changed`.
<!-- AC:END -->
