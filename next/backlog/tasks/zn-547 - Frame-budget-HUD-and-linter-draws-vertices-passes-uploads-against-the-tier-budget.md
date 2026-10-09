---
id: ZN-547
title: >-
  Frame budget HUD and linter: draws, vertices, passes, uploads against the tier
  budget
status: Backlog
assignee: []
created_date: '2026-10-09 07:45'
labels:
  - rpi
  - 3d
  - size-M
milestone: m-25
dependencies:
  - ZN-375
  - ZN-534
ordinal: 340130
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Count, per frame, draws, vertices, full-screen passes, FBO switches, texture uploads and readbacks in libzn_webgl and the GL renderer. Show them in the perf overlay (ZN-375) and warn when a tier budget (T2-pi1, T2-pi3) is exceeded; the budgets come from RPI-3D-01. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the overlay shows the counters on macOS and on the Pi
- [ ] #2 a scene with an EffectComposer bloom triggers a T2 warning
- [ ] #3 budgets live in one table that the report references
<!-- AC:END -->
