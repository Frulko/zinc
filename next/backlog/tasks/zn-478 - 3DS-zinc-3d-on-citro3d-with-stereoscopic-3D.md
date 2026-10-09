---
id: ZN-478
title: '3DS: zinc:3d on citro3d with stereoscopic 3D'
status: Backlog
assignee: []
created_date: '2026-10-09 07:38'
labels:
  - 3d
  - 3ds
  - handheld
  - handhelds
  - size-L
milestone: m-23
dependencies:
  - ZN-469
ordinal: 300250
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
render3d.n3ds.cpp: picasso vertex shader, fragment lighting LUTs or vertex lighting, tiled textures, stereo with gfxSet3D and an eye offset from osGet3DSliderState (skipped when the slider is 0); plugins/three runs on it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/3d/cubes and examples/three/cubes render in Azahar
- [ ] #2 a stereo pair is produced when the slider is above 0
- [ ] #3 frame rate recorded for Old and New 3DS settings
<!-- AC:END -->
