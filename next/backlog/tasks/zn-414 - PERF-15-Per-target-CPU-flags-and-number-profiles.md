---
id: ZN-414
title: PERF-15 Per-target CPU flags and number profiles
status: Backlog
assignee: []
created_date: '2026-10-09 07:34'
labels:
  - perf
  - size-M
milestone: m-21
dependencies: []
priority: medium
ordinal: 5140
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
main.cpp:1250 and tc/tc.cpp:321 build every armhf binary with -mcpu=arm1176jzf_s (ARMv6, no NEON) including Pi 2/3 32-bit; aarch64 has no -mcpu; profile.cpp has no psp/vita/3ds/chip profile, so number would be software double on PSP (single-precision FPU). Add an armv7+NEON armhf variant (cortex-a7/a53), -mcpu=cortex-a53 for aarch64 Pi 3, cortex-a8+neon for CHIP, chosen by deploy/export per board; profiles psp (number f32), vita, 3ds, chip.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc build --target armhf-linux has an armv6 and an armv7-neon variant; deploy picks by board
- [ ] #2 M4 kernels and render corpus measured on both variants under QEMU user and on the Pi rig, numbers in the task
- [ ] #3 psp profile with number = f32 and the conformance goldens of f32 profiles passing
<!-- AC:END -->
