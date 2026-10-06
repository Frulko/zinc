---
id: ZN-054
title: Windows and Linux hosts
status: Backlog
assignee: []
created_date: '2026-10-06 16:42'
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
