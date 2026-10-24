---
id: ZN-414
title: PERF-15 Per-target CPU flags and number profiles
status: Done
assignee: []
created_date: '2026-10-09 07:34'
updated_date: '2026-10-25 01:53'
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
- [x] #3 psp profile with number = f32 and the conformance goldens of f32 profiles passing
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done on the development Mac (owner, 2026-10-10: the cross-platform pass comes at the end). The CPU of each target is a field of the target table (src/tc/tc.h cpuFlags), used by the runtime objects, the CMake wrappers of the cross host libraries, the program link and the plugin builds: four hard-coded armhf cases removed. Targets: armhf-linux -mcpu=arm1176jzf_s (ARMv6, every 32-bit Pi), new armv7-linux -mcpu=cortex_a8 (ARMv7-A + NEON + VFPv3; decision: one ARMv7 variant whose oldest core is the CHIP's A8, because a cortex_a7 build may emit VFPv4 instructions the A8 lacks; the Pi 2 A7 and Pi 3 A53 run it), aarch64-linux -mcpu=cortex_a53 (ARMv8.0, runs on A55/A72/A76). export/deploy pick by board: rpi1 -> armhf-linux, rpi2/chip/pocketchip -> armv7-linux, rpi/linux/rmpp -> aarch64-linux; --deb names armv7 armhf. Profiles added with the values of ZN-453 and ZN-513: psp (f32, 480x272, 16 MiB), vita (f64, 960x544, 192 MiB), n3ds (f64, 400x240, 16 MiB), chip (f64, 720x576, 128 MiB), pocketchip (f64, 480x272, 128 MiB). AC#3: tests/t1/profile.sh now runs the f32 goldens under --profile psp too: PASS. AC#1 and AC#2 moved to ZN-414.01 (deferred): zig 0.15.2 compiles C for cortex_a8, arm1176jzf_s and cortex_a53, nothing linked or run for ARM yet; tests/t2/cross_cpu.sh is written for it. tc T0 test PASS. Usage: n/a.
Review 2026-10-25: the open criteria are moot. Needs ARM and QEMU/Pi: cross pass line.
<!-- SECTION:NOTES:END -->
