---
id: ZN-124
title: zinc test and the Runner interface
status: Review
assignee: []
created_date: '2026-10-06 22:59'
updated_date: '2026-10-07 14:10'
labels:
  - tools
  - tests
  - size-M
milestone: m-11
dependencies:
  - ZN-122
  - ZN-123
ordinal: 40660
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Section 6.3 of docs/reports/parity/03: the Node sim oracle is replaced by frozen goldens plus the interpreter as the reference engine; `zinc test [dir] [--profile] [--runner]` with runners HostInterp, HostAot, Quickjs, Esp32Qemu, DeviceSim (later QemuUser, PcsxRedux), output format and exit codes of the prototype (docs/guide/06-testing.md), `zinc:assert` and `zinc test <dir>` for Zinc-written tests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `zinc test` over the 18 M3 programs gives PASS on every runner listed; skip lines name the reason
- [x] #2 examples/testing/tests runs under `zinc test`
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. zinc test --runner interp|aot|quickjs|esp32-qemu|devicesim (skip lines name the reason), project mode (test-*.ts, *.test.ts, exit 0 passes), zinc:assert compiles (generic T -> unknown, never -> void). interp and aot: 56/61 conformance, the 5 gaps are ZN-312; quickjs: 20 run (4 engine differences), 41 skipped (typed/JSX/zinc:* modules). AC1 open: not every runner PASSes. Follow-up: AOT runner takes ~25 min (O2 per program), parallel/-O0 later.
<!-- SECTION:NOTES:END -->
