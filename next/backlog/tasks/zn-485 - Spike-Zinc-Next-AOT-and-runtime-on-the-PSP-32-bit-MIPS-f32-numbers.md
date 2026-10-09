---
id: ZN-485
title: 'Spike: Zinc Next AOT and runtime on the PSP (32-bit MIPS, f32 numbers)'
status: Backlog
assignee: []
created_date: '2026-10-09 07:38'
labels:
  - handheld
  - pocketjs
milestone: m-23
dependencies:
  - ZN-456
ordinal: 300320
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build the AOT C++ of a few programs plus src/rt and the runtime/ raster with psp-g++ (-O2, -G0, single float), add a psp profile mirroring ps2 (f32 numbers, 480x272), and list what breaks on a 32-bit little-endian MIPS with newlib: 8-byte Slot alignment, pointer width, libm f32, number to string conversions, stack size (run on a 1 MB thread with the VFPU attribute). Run the result in PPSSPPHeadless by hand. Compare the binary size with the prototype PS1/PS2 builds. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 fib and at least 10 conformance programs build as PSP executables and print the same output as the interpreter under the psp profile in PPSSPPHeadless
- [ ] #2 A table records binary size (text, data, bss) and peak heap for each program
- [ ] #3 Every source change needed in src/rt or runtime/ is either made with a T0 test or filed as a follow-up task (ZN-145 for 32-bit references)
- [ ] #4 The notes say whether the device core interpreter (src/dev) also builds for PSP, as a fallback
<!-- AC:END -->
