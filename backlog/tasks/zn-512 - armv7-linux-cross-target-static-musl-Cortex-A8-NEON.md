---
id: ZN-512
title: 'armv7-linux: NEON in -mcpu and its checks'
status: Backlog
assignee: []
created_date: '2026-10-09 07:40'
labels:
  - chip
milestone: m-24
dependencies:
  - ZN-132
ordinal: 52800
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-10-25):** Add +neon (and VFPv3) to the armv7-linux -mcpu, check with readelf -A in cross_linux.sh; drop the static-musl and CHIP-03 criteria. Already there: src/tc/tc.cpp:195; src/cli_core.cpp:1041.

Add armv7-linux to src/tc (targets(), crossBuild, ensureCrossLibs wrappers, plugin_build crossArch): zig target arm-linux-musleabihf, -mcpu=cortex_a8+neon (zig's cortex_a8 model has no NEON/VFP3 by default), -static, -O2 -ffp-contract=off. Static musl runs on NTC 4.4 jessie (glibc 2.19), Debian trixie, OpenWrt and Buildroot; zig's default glibc for 32-bit Arm is 2.34. dynlib is false (no dlopen). Measure -mthumb against -marm. See docs/reports/hardware/ntc-chip.md 3.5 and 9.1. (From docs/reports/hardware/ntc-chip.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc build --target armv7-linux hello.ts produces a static ELF32 ARM EABI5 hard-float executable with no NEEDED entries
- [ ] #2 readelf -A shows Tag_CPU_arch v7, Tag_FP_arch VFPv3 and Tag_Advanced_SIMD_arch NEONv1
- [ ] #3 examples/hero and examples/bouncing-ball link with the graphics host (null HAL) for armv7-linux; sizes recorded for -marm and -mthumb
- [ ] #4 hello prints the same output under qemu-arm -cpu cortex-a8 as on the host (Linux CI; on macOS through CHIP-03)
- [ ] #5 tests/t2/cross_linux.sh covers the new target
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: done-partly. armv7-linux exists (src/tc/tc.cpp:195, zigTargetFor chip/rpi2 -> armv7-linux, glibc 2.28 not static musl). Left: add +neon to -mcpu (flag is cortex_a8 only), a readelf check and tests/t2/cross_linux.sh row. Evidence: src/tc/tc.cpp:195; src/cli_core.cpp:1041
<!-- SECTION:NOTES:END -->
