---
id: ZN-534
title: >-
  Measure the VC4 baseline on the Pi 3B+ rig: fill, draw cost, r162 shader
  budgets, Pi 1 proxy
status: Backlog
assignee: []
created_date: '2026-10-09 07:45'
labels:
  - rpi
  - 3d
  - size-M
milestone: m-25
dependencies: []
ordinal: 340000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the estimates of the report (A4, A5, A7) with measurements. On the Pi 3B+ (aarch64 and armhf builds, vcgencmd get_throttled = 0x0 before and after): full-screen pass throughput per shader class (solid, textured RGBA tiled and linear, ETC1, blended, discard) at 640x360, 1280x720 and 1920x1080 with glFinish timing; microseconds per draw in Mesa vc4 for uniform-only, texture-switch and program-switch patterns; compile every three r162 material variant with VC4_DEBUG=shaderdb (instruction counts, threaded or not, failures); run the report's C1-C4 three.js benches; repeat under a Pi 1 proxy (arm_freq=600, maxcpus=1, v3d_freq=250, core_freq=250, armhf binary). (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Mpx/s table for 5 shader classes x 3 resolutions written into the report
- [ ] #2 us per draw for 3 state-change patterns on aarch64 and armhf written into the report
- [ ] #3 per-material table for three r162: QPU instructions, threaded flag, compile failures
- [ ] #4 C1-C4 fps on the Pi 3B+ and on the Pi 1 proxy recorded; estimates in A5 and A7 confirmed or replaced
<!-- AC:END -->
