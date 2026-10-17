---
id: ZN-477
title: 'Vita: zinc:3d on GLES2 and WebGL1'
status: Backlog
assignee: []
created_date: '2026-10-09 07:38'
labels:
  - 3d
  - handheld
  - handhelds
  - vita
  - webgl
  - size-L
milestone: m-23
dependencies:
  - ZN-471
  - ZN-493
ordinal: 214592
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
render3d.vita.cpp on GLES2; libzn_webgl linked statically with Api::Gles2 on the Vita context for zinc:script (WebGL1); document that real three.js needs r162 or older (r163 removed WebGL1).

2026-10-17 (D144): zinc:3d on the Vita sits on ZN-493's GXM renderer (precompiled GXP, no vitaGL: LGPL and libshacccg on the user's console); the GLES2/WebGL1 part for zinc:script is measured against it and kept only if PVR_PSP2 or vitaGL is the path ZN-470 chose.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/3d/cubes and examples/three/cubes run at 60 fps
- [ ] #2 the WebGL1 conformance run reports its pass count next to the Pi 3 GLES2 figure
- [ ] #3 a three.js r162 sample renders through zinc:script
<!-- AC:END -->
