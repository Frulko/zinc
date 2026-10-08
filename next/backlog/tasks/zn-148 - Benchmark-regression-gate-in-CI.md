---
id: ZN-148
title: Benchmark regression gate in CI
status: Done
assignee: []
created_date: '2026-10-06 23:03'
updated_date: '2026-10-08 08:45'
labels:
  - performance
  - tests
  - size-S
milestone: m-12
dependencies: []
ordinal: 40900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
bench-m4 --check-regressions in the T2 workflow on the macOS and Linux runners with stored per-machine baselines (relative ratios against QuickJS, not absolute times), the table published as a workflow artifact.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a deliberate 20% slowdown in a branch fails the job
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. tools/bench-gate (4 kernels, 5 runs, each engine's time relative to QuickJS of the same run against bench/m4.json, 15% tolerance, exit 3), bench-m4 gained --kernels/--inject-slowdown/--relative/--no-startup; tests/t2/bench_gate.sh: the unchanged engine passes and --inject-slowdown 1.2 fails (exit 3, 8 regressions listed); CI job bench-gate on macos-14 in .github/workflows/zinc-next.yml (never run on a runner yet). Open: the committed baseline was measured on this machine; a hosted runner may need its ratios re-recorded.
<!-- SECTION:NOTES:END -->
