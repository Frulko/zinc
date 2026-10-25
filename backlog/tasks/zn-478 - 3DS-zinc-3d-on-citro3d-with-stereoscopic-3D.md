---
id: ZN-478
title: '3DS: zinc:3d on citro3d with stereoscopic 3D'
status: Backlog
assignee: []
created_date: '2026-10-09 07:38'
updated_date: '2026-10-25 00:13'
labels:
  - 3d
  - 3ds
  - handheld
  - handhelds
  - size-L
milestone: m-23
dependencies:
  - ZN-469
  - ZN-495
ordinal: 51800
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
render3d.n3ds.cpp: picasso vertex shader, fragment lighting LUTs or vertex lighting, tiled textures, stereo with gfxSet3D and an eye offset from osGet3DSliderState (skipped when the slider is 0); plugins/three runs on it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/3d/cubes and examples/three/cubes render in Azahar
- [x] #2 a stereo pair is produced when the slider is above 0
- [ ] #3 frame rate recorded for Old and New 3DS settings
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-17 (owner: "prends bonnes notes sur comment Pocket3D s'adapte aux hardware"): read ../docs/reports/games/pocket3d-hardware-adaptation.md before starting. No Pocket3D game uses stereo 3D (gfxSet3D(false) everywhere): do this task last.

2026-10-25: render3d.n3ds.cpp + render3d.n3ds.v.pica (f404035d) draw zinc:3d on the PICA200 inside c3d_n3ds.cpp's frame. Azahar, examples/3d/cubes: 3D 2.05 ms vs 25.31 in software; examples/3d/orbit: 4.5 ms. Stereo: both eyes shot with ZINC_3D_SLIDER=1. Left: examples/three/cubes (WebGL), the Old/New 3DS frame rates (only Azahar's default measured).
<!-- SECTION:NOTES:END -->
