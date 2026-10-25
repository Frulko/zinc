---
id: ZN-477
title: 'Vita: zinc:3d and WebGL1 (zinc:script) on vitaGL'
status: Backlog
assignee: []
created_date: '2026-10-09 07:38'
updated_date: '2026-10-25 00:27'
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
ordinal: 51100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** render3d.vita on vitaGL with libzn_webgl linked statically (Api::Gles2); ship the programs as precompiled GXP so users need no libshacccg (glShaderBinary); examples/3d/cubes at 60 fps on the Vita, WebGL1 pass count next to the Pi 3 figure. ZN-493 stays the GXM cooked-pack path.

render3d.vita.cpp on GLES2; libzn_webgl linked statically with Api::Gles2 on the Vita context for zinc:script (WebGL1); document that real three.js needs r162 or older (r163 removed WebGL1).

2026-10-17 (D144): zinc:3d on the Vita sits on ZN-493's GXM renderer (precompiled GXP, no vitaGL: LGPL and libshacccg on the user's console); the GLES2/WebGL1 part for zinc:script is measured against it and kept only if PVR_PSP2 or vitaGL is the path ZN-470 chose.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/3d/cubes and examples/three/cubes run at 60 fps
- [ ] #2 the WebGL1 conformance run reports its pass count next to the Pi 3 GLES2 figure
- [ ] #3 a three.js r162 sample renders through zinc:script
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. vitaGL now builds and runs on the owner's Vita (D165), and D165 sends zinc:gl/WebGL1/three/zinc:3d there while D144 names GXM; the task text names GLES2 on PVR_PSP2. Rewrite on vitaGL. Evidence: targets/vita/gl_vita.cpp; third_party/vitagl

2026-10-25: zinc:3d on GXM (df12637b, render3d.vita.cpp): CPU per-vertex lighting (the software renderer's shade) into a colour stream, GPU transform, depth, culling, textures and blending; psp2spvc cannot compile the lighting shader. Vita3K: cubes 0.74 ms vs 6.02 software, orbit 2.21 ms at 61.5 fps. Left: WebGL1 on vitaGL, the hardware run.
<!-- SECTION:NOTES:END -->
