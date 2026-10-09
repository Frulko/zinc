---
id: ZN-476
title: 'PSP: zinc:3d on the GE with VFPU transforms'
status: Backlog
assignee: []
created_date: '2026-10-09 07:38'
labels:
  - 3d
  - handheld
  - handhelds
  - psp
  - size-L
milestone: m-23
dependencies:
  - ZN-468
ordinal: 300230
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
plugins/3d/native/render3d.psp.cpp: GE hardware transform and lighting (4 lights), sceGum matrices on the VFPU, 16-bit vertex formats, swizzled textures, software culling for the planes the GE does not clip (it clips only the near plane); plugins/three runs on it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/3d/cubes and examples/three/cubes render in PPSSPP and match the host zinc:3d render structurally (golden with tolerance)
- [ ] #2 frame rate at 480x272 recorded (hardware or marked PPSSPP)
<!-- AC:END -->
