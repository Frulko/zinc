---
id: ZN-476
title: 'PSP: zinc:3d on the GE with VFPU transforms'
status: Backlog
assignee: []
created_date: '2026-10-09 07:38'
updated_date: '2026-10-25 00:13'
labels:
  - 3d
  - handheld
  - handhelds
  - psp
  - size-L
milestone: m-23
dependencies:
  - ZN-468
  - ZN-491
ordinal: 50800
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
plugins/3d/native/render3d.psp.cpp: GE hardware transform and lighting (4 lights), sceGum matrices on the VFPU, 16-bit vertex formats, swizzled textures, software culling for the planes the GE does not clip (it clips only the near plane); plugins/three runs on it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/3d/cubes and examples/three/cubes render in PPSSPP and match the host zinc:3d render structurally (golden with tolerance)
- [x] #2 frame rate at 480x272 recorded (hardware or marked PPSSPP)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-17 (owner: "prends bonnes notes sur comment Pocket3D s'adapte aux hardware"): read ../docs/reports/games/pocket3d-hardware-adaptation.md before starting. Pocket3D uses the VFPU only as a thread attribute: measure before writing VFPU transforms; the PSP rules of ZN-468's note apply.

2026-10-25: render3d.psp.cpp (26e17321) draws zinc:3d on the GE, with the GU's lights, without the VFPU (the GE transforms). PPSSPP, examples/3d/cubes: 3D 6.57 ms/frame vs 29.88 in software; examples/3d/orbit (2,300 tris): 15 ms, 60 fps. Shots match the software render by eye. Left: #1, the golden with tolerance, and examples/three/cubes (three needs WebGL, none on the PSP). Next: a tests/t1 test that compares the PPSSPP shot with the host render.
<!-- SECTION:NOTES:END -->
