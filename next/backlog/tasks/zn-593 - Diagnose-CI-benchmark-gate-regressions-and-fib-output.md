---
id: ZN-593
title: 'Diagnose CI benchmark gate regressions and fib output'
status: Review
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

## Implementation Notes

- The historical baseline is from `fb610f986e50a0533301cbcc16b5addefb56089f`
  on macOS 15.7.4. CI runs macOS 14.8.9 with Homebrew QuickJS 2026-06-04;
  the historical artifact records neither the CPU model nor its QuickJS version.
  Dividing by QuickJS cannot establish equal scaling for interpreter/native
  workloads across machines.
- `bench-m4 --baseline-zinc` measures the fixed historical build on the same
  runner and kernel sources, retaining the 15% time threshold. It preserves the
  committed M4 artifact. Ordinary M4 target verdicts remain separate from the
  CI correctness/regression gate. Same-runner mode measures interpreter/AOT
  directly and requires neither Node, external QuickJS, nor prototype binaries.
- Every timed sample now verifies its exit status and golden stdout; failures
  include stdout/stderr diagnostics. Missing baseline measurements also fail.
- Twelve deterministic harness checks pass, including an injected 20% slowdown
  returning exit 3 and a failed timed sample returning exit 1.
- Both builds are warmed before alternating paired samples. A sequential
  self-comparison reported nbody AOT +17% on the identical engine; pairing
  removes that ordering bias without increasing the tolerance.
- The redundant T2 timed self-comparison is removed. T2 retains the deterministic
  T0 correctness/slowdown contract checks; the dedicated CI job measures the
  candidate against the pinned historical engine once.
- The candidate at `90dc1797` compiles and interprets the fib benchmark with
  exact stdout `2178309\n`, empty stderr and exit 0. The historical CI failure
  is not reproduced by this focused local run.
- The fixed reference rebuild is viable after reconstructing its omitted SDL
  configuration headers and HAL command-list declarations. Its fib interpreter
  and AOT build/run both produce the exact golden output with exit 0.
- See [the benchmark gate report](../../../docs/reports/zinc-next-bench-gate.md).
  The final candidate `b092de67` (on main `2ec2657b`) passes the pinned paired
  gate with exit 0, no incorrect outputs and no regressions. Its largest
  slowdown is fib interpreter +3.97%; nbody AOT is 63.75% faster. All eight
  interpreter/AOT cells contain five samples on each side. Artifact:
  `/tmp/zinc-ci-pinned-paired.json`.
- The runtime alignment fix, macOS fixtures, and benchmark measurement changes
  are kept in separate commits. Final affected T0/T1 validation reports 250
  passed, 0 failed, 2 prerequisite skips; the five rebase integration cases also
  pass. Fresh GitHub confirmation remains pending the push. The historical fib
  mismatch remains unreproduced locally, so its original cause is not claimed
  as a diagnosed runtime bug.
