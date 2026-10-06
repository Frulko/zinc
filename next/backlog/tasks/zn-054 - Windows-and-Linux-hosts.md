---
id: ZN-054
title: Windows and Linux hosts
status: Review
assignee: []
created_date: '2026-10-06 16:42'
updated_date: '2026-10-06 19:01'
labels:
  - size-L
dependencies: []
ordinal: 32700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Port the host side: toolchain pins for Windows (zig, esptool, QEMU), serial ports, SDL, paths, the CI matrix (macOS, Linux, Windows) running T0 and T1.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 T0 and T1 pass on Windows and Linux in CI
- [ ] #2 zinc build --target aarch64-linux works from each host
- [ ] #3 zinc run --target esp32 works from each host (emulator at least)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Linux verified in an ubuntu:24.04 aarch64 container: T0, T1, T2 pass (oracle tests skip via exit 77 + tools/oracle --available); build warning-free on gcc; -ffp-contract=off everywhere (pinball AOT diff on gcc); QEMU missing-library message; ZINC_TEST_HOME; CI workflow written, not run. Windows not ported (doc lists the work). ACs left open: Windows, CI.
<!-- SECTION:NOTES:END -->
