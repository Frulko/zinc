---
id: ZN-470
title: 'Vita: choose the GPU path (PVR_PSP2, vitaGL, GXM + precompiled GXP)'
status: In Progress
assignee: []
created_date: '2026-10-09 07:38'
updated_date: '2026-10-17 13:35'
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
ordinal: 214586
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-17 (owner: "prends bonnes notes sur comment Pocket3D s'adapte aux hardware"): read ../docs/reports/games/pocket3d-hardware-adaptation.md before starting. Vita: Cg compiled on a real console, cached by source hash, shipped as GXP, a release refused without a matching console pass; draw straight into the 4x MSAA display surface (~4.1 ms); parameter buffer 32 MB; re-assert 444/222/222/166 MHz after suspend.

2026-10-17 (owner: "pourquoi la vita utilise pas son gpu… go le faire !", via the coordinator): chosen path, own GXM back end with SDL3's precompiled GXP programs (zlib, the vendored third_party/SDL3/src/render/vitagxm/SDL_render_vita_gxm_shaders.h: colour pair, texture-times-colour pair), as docs/reports/games/console-2d-3d-frameworks.md section 4.3 scores it (59 against vitaGL's 50). Why: no shader compiler and no libshacccg.suprx for the user (vitaGL makes each user extract it from their console), no LGPL, no Sony modules shipped (PVR_PSP2), the replay of zinc:gfx needs only quads (colour, texture x colour), and Vita3K runs it. Not taken: display-gl's gl_renderer on vitaGL or PVR_PSP2 (the GLSL replay of runtime/gl_replay.cpp would need the runtime shader compiler on the console). Code: targets/vita/gxm_vita.cpp (init after SDL's gxm_init: 3 display buffers in CDRAM flipped by the display queue at vblank, 16 MiB parameter buffer, shader patcher; textures and the glyph atlas in a CDRAM heap; one scene a frame at 960x544). Redistribution (criterion 3): nothing is shipped beside the core; the GXP blobs are compiled into it under SDL's zlib licence (vendored, notice kept in the header).
<!-- SECTION:NOTES:END -->
