---
id: ZN-124
title: zinc test and the Runner interface
status: Backlog
assignee: []
created_date: '2026-10-06 22:59'
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
- [ ] #2 examples/testing/tests runs under `zinc test`
<!-- AC:END -->
