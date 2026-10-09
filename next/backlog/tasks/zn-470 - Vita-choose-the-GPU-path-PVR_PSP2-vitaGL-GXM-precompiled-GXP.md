---
id: ZN-470
title: 'Vita: choose the GPU path (PVR_PSP2, vitaGL, GXM + precompiled GXP)'
status: Backlog
assignee: []
created_date: '2026-10-09 07:38'
labels:
  - gpu
  - handheld
  - handhelds
  - spike
  - vita
  - size-M
milestone: m-23
dependencies:
  - ZN-464
ordinal: 300170
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build display-gl's gl_renderer (GLSL ES 1.00) on PVR_PSP2 (GLES2 + EGL) and on vitaGL; list the run-time requirements (modules shipped with the app, libshacccg for vitaGL), Vita3K support, fill rate at 960x544, and licences; compare with a GXM backend using precompiled GXP shaders (SDL vitagxm / vita2d style).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 decision record with measurements on hardware (or Vita3K, marked) and the user-side requirements of each path
- [ ] #2 the chosen path renders examples/ui/gl-check
- [ ] #3 redistribution of any module shipped with the core is checked and documented
<!-- AC:END -->
