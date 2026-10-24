---
id: ZN-470
title: 'Vita: choose the GPU path (PVR_PSP2, vitaGL, GXM + precompiled GXP)'
status: Done
assignee: []
created_date: '2026-10-09 07:38'
updated_date: '2026-10-25 01:53'
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
- [x] #1 decision record with measurements on hardware (or Vita3K, marked) and the user-side requirements of each path
- [x] #2 the chosen path renders examples/ui/gl-check
- [x] #3 redistribution of any module shipped with the core is checked and documented
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-17 (owner: "prends bonnes notes sur comment Pocket3D s'adapte aux hardware"): read ../docs/reports/games/pocket3d-hardware-adaptation.md before starting. Vita: Cg compiled on a real console, cached by source hash, shipped as GXP, a release refused without a matching console pass; draw straight into the 4x MSAA display surface (~4.1 ms); parameter buffer 32 MB; re-assert 444/222/222/166 MHz after suspend.

2026-10-17 (owner: "pourquoi la vita utilise pas son gpu… go le faire !", via the coordinator): chosen path, own GXM back end with SDL3's precompiled GXP programs (zlib, the vendored third_party/SDL3/src/render/vitagxm/SDL_render_vita_gxm_shaders.h: colour pair, texture-times-colour pair), as docs/reports/games/console-2d-3d-frameworks.md section 4.3 scores it (59 against vitaGL's 50). Why: no shader compiler and no libshacccg.suprx for the user (vitaGL makes each user extract it from their console), no LGPL, no Sony modules shipped (PVR_PSP2), the replay of zinc:gfx needs only quads (colour, texture x colour), and Vita3K runs it. Not taken: display-gl's gl_renderer on vitaGL or PVR_PSP2 (the GLSL replay of runtime/gl_replay.cpp would need the runtime shader compiler on the console). Code: targets/vita/gxm_vita.cpp (init after SDL's gxm_init: 3 display buffers in CDRAM flipped by the display queue at vblank, 16 MiB parameter buffer, shader patcher; textures and the glyph atlas in a CDRAM heap; one scene a frame at 960x544). Redistribution (criterion 3): nothing is shipped beside the core; the GXP blobs are compiled into it under SDL's zlib licence (vendored, notice kept in the header).

2026-10-17, hardware proof (the owner's PS Vita, Meadow Run, 4,200 frames of play, ux0:data/ZINC00011/zinc.log): GXM on at 960x544, 60 fps, no frame missed a vblank (frame p50 16.68 ms, max 17.9 ms); work p50 3.2-3.7 ms (max 8.8), replay CPU time p50 0.3-0.44 ms, the rest of the frame is the display queue's vblank wait; 133 MiB of main memory and 112 MiB of CDRAM free at start, 64 MiB of CDRAM taken for textures. The software path the owner called unplayable: in Vita3K at 960x544 its raster costs 28 ms a frame on the Mac's clock (30 fps); its hardware number comes from the measuring launch now armed (ux0:data/ZINC00011/measure, ZINC_VITA_SOFT_FRAMES=120). AC#3 checked: nothing ships beside the core, the GXP blobs are compiled in under SDL's zlib licence. Handover: AC#1 is the decision record (the coordinator writes it from this note: chosen GXM + SDL GXP, scores in console-2d-3d-frameworks.md 4.3, user requirements: none for GXM; vitaGL needs libshacccg.suprx extracted by each user; PVR_PSP2 ships Sony modules without a licence), then tick it. AC#2 (examples/ui/gl-check) needs zinc:gl, a 3D/GL path the 2D replay does not give: next step is a GXP pair compiled from our own Cg (console-2d-3d-frameworks.md 4.3: SceShaccCg on a console, committed as GXP).

2026-10-17 (coordinator): AC1 by D151 (docs/reports/zinc-next-decisions.md), measured on the owner's PS Vita: Meadow Run 60 fps on GXM.

2026-10-25 (owner: "tu me fais un support avec vitaGL pour la psvita ?", D165): vitaGL vendored in third_party/vitagl (pinned, with vitaShaRK, math-neon, SceShaccCgExt, taiHEN stubs); tools/build-console-core vita --vitagl replays zinc:gfx through runtime/gl_replay.cpp on vitaGL (targets/vita/gl_vita.cpp, same entry points as gxm_vita.cpp). Proved in Vita3K: the core builds and links, vitaGL initialises, and without ur0:data/libshacccg.suprx it says so and draws the hello in software (blue, yellow square, text). Not proved: the GPU replay itself needs libshacccg.suprx (Vita3K here has none) — next: copy it into Vita3K's ur0/data or run on the owner's Vita, then examples/ui/gl-check (AC2) and Meadow Run frame times against GXM.

2026-10-25, hardware proof of the vitaGL path (D165): the owner's PS Vita (libshacccg.suprx in ur0:data/external), examples/ui/gl-check ZINC_SCENE=cycle built with --vitagl (ZINC00020): every command on the GPU (0 LINE/POLY skipped, 0 CPU tiles, stencil 8, family PowerVR tiler), 60.4 fps with 0 missed vblanks; the first launch compiles 17 programs in 10.3 s (32 fps for 600 frames), the second reads vitaGL's shader cache in 86 ms and holds 60 fps from the start. GXM build of the same program (ZINC00021): 60.3 fps with the rounded/gradient scenes in software. PSP: the owner ran examples/hardware-psp (GE replay) under Adrenaline on the same console: runs well. Later: ship the replay's programs as precompiled GXP (glShaderBinary) so users need no libshacccg; zinc:gl/WebGL1 on vitaGL (ZN-477).

2026-10-25, Meadow Run on vitaGL (ZINC00012) vs GXM (ZINC00011) on the owner's Vita: vitaGL 29 missed vblanks in 600 frames, replay p50 1.10 / p99 16.1 ms; GXM 0 missed, 0.32 / 0.39 ms. Decision (D165): GXM stays the 2D default and grows the rounded/border/shadow commands (coverage atlas as targets/console/ff_replay.cpp does for the GE); vitaGL is for zinc:gl/WebGL1/three/zinc:3d (ZN-477). Possible vitaGL tuning not tried: its BUFFERS_SPEEDHACK / circular pool options, a ring of vertex buffers in the replay.
Review 2026-10-25: closed as Done. GPU path chosen (D151 GXM + SDL GXP as 2D default; D165 vitaGL for GL) and proved on the owner's Vita: Meadow Run 60 fps on GXM, examples/ui/gl-check 60 fps on vitaGL, redistribution checked. Evidence: targets/vita/gxm_vita.cpp; targets/vita/gl_vita.cpp; third_party/vitagl; docs/reports/zinc-next-decisions.md D151, D165; commits d962083a, 8f1a4756, f02510df Verifier: D151 (GXM 2D default) and D165 (vitaGL for GL) recorded; examples/ui/gl-check at 60.4 fps with 0 missed vblanks on the owner's Vita via vitaGL (notes 2026-10-25); redistribution checked.
<!-- SECTION:NOTES:END -->
