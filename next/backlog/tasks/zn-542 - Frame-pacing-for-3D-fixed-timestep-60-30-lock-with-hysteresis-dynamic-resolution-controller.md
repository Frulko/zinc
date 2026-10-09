---
id: ZN-542
title: >-
  Frame pacing for 3D: fixed timestep, 60/30 lock with hysteresis,
  dynamic-resolution controller
status: Backlog
assignee: []
created_date: '2026-10-09 07:45'
labels:
  - rpi
  - 3d
  - size-M
milestone: m-25
dependencies:
  - ZN-537
ordinal: 340080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The animation loop gets a fixed-dt simulation with interpolated rendering. A frame-rate lock drops to a steady 30 fps when 60 cannot be held. A controller drives RPI-3D-03's render scale from page-flip timestamps. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 on the Pi 3B+ C2 bench, frame-time p99 is within one vblank of the target
- [ ] #2 render scale settles within 1 s after a load change and changes at most once per 2 s
- [ ] #3 simulation state identical between 30 and 60 fps runs (deterministic test)
<!-- AC:END -->
