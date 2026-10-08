---
id: ZN-133
title: 'Pi and Linux ARM runner: pinned qemu-user, Linux CI image without Docker'
status: Backlog
assignee: []
created_date: '2026-10-06 23:00'
updated_date: '2026-10-08 08:18'
labels:
  - parked
milestone: m-11
dependencies:
  - ZN-132
  - ZN-124
ordinal: 40750
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
<!-- SECTION:NOTES:END -->
