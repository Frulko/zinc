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
ordinal: 300240
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
render3d.vita.cpp on GLES2; libzn_webgl linked statically with Api::Gles2 on the Vita context for zinc:script (WebGL1); document that real three.js needs r162 or older (r163 removed WebGL1).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/3d/cubes and examples/three/cubes run at 60 fps
- [ ] #2 the WebGL1 conformance run reports its pass count next to the Pi 3 GLES2 figure
- [ ] #3 a three.js r162 sample renders through zinc:script
<!-- AC:END -->
