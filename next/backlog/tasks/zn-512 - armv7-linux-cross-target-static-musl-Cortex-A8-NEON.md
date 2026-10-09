---
id: ZN-512
title: 'armv7-linux cross target: static musl, Cortex-A8 + NEON'
status: Backlog
assignee: []
created_date: '2026-10-09 07:40'
labels:
  - chip
milestone: m-24
dependencies:
  - ZN-132
ordinal: 320000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add armv7-linux to next/src/tc (targets(), crossBuild, ensureCrossLibs wrappers, plugin_build crossArch): zig target arm-linux-musleabihf, -mcpu=cortex_a8+neon (zig's cortex_a8 model has no NEON/VFP3 by default), -static, -O2 -ffp-contract=off. Static musl runs on NTC 4.4 jessie (glibc 2.19), Debian trixie, OpenWrt and Buildroot; zig's default glibc for 32-bit Arm is 2.34. dynlib is false (no dlopen). Measure -mthumb against -marm. See docs/reports/hardware/ntc-chip.md 3.5 and 9.1. (From docs/reports/hardware/ntc-chip.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc build --target armv7-linux hello.ts produces a static ELF32 ARM EABI5 hard-float executable with no NEEDED entries
- [ ] #2 readelf -A shows Tag_CPU_arch v7, Tag_FP_arch VFPv3 and Tag_Advanced_SIMD_arch NEONv1
- [ ] #3 examples/hero and examples/bouncing-ball link with the graphics host (null HAL) for armv7-linux; sizes recorded for -marm and -mthumb
- [ ] #4 hello prints the same output under qemu-arm -cpu cortex-a8 as on the host (Linux CI; on macOS through CHIP-03)
- [ ] #5 tests/t2/cross_linux.sh covers the new target
<!-- AC:END -->
