---
id: ZN-133
title: 'Pi and Linux ARM runner: pinned qemu-user, Linux CI image without Docker'
status: Backlog
assignee: []
created_date: '2026-10-06 23:00'
updated_date: '2026-10-25 01:53'
labels:
  - parked
milestone: m-11
dependencies:
  - ZN-132
  - ZN-124
ordinal: 90000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decision D6: aarch64-linux is the primary Pi target, armv6 secondary. A QemuUser runner (pinned qemu-user static on Linux; documented container recipe on macOS), a documented ubuntu CI recipe (qemu-user, llvmpipe, wasmtime, PCSX-Redux where available) and T2 lines for each.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the 9 programs of the old rpi1 row pass under `qemu-arm -cpu arm1176`; the aarch64 set passes under qemu-aarch64
- [x] #2 the GitHub workflow runs T2 on ubuntu-24.04 and ubuntu-24.04-arm
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
parked 2026-10-08: AC2 holds (the workflow runs T2 on ubuntu-24.04 and ubuntu-24.04-arm); AC1 needs a Linux host for qemu-user (macOS has no qemu-user) and the old rpi1 programs; the runner can only be written blind here. Resume on a Linux machine or when CI logs are available.
Review 2026-10-25: parked. Parked on a Linux host; the only open AC is the qemu-user runner. ZN-414.01 needs the same runner, so both become one cross-pass task.
Review 2026-10-25: merged ZN-414.01 here (PERF-15.01 Cross-platform check of the ARM CPU variants: cross_cpu, QEMU user and Pi measures). Carry over: Needs qemu-user and a Pi: the same Linux runner as ZN-133. Fold tests/t2/cross_cpu.sh and the M4/render measures into that task. ZN-133 is open (parked) and is the Linux qemu-user runner; carry over tests/t2/cross_cpu.sh (ARMv6/ARMv7+NEON attribute checks) and the M4 kernels and render corpus measures under qemu-user and on a Pi.
<!-- SECTION:NOTES:END -->
