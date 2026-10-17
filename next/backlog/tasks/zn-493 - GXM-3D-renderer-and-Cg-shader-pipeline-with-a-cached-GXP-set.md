---
id: ZN-493
title: GXM 3D renderer and Cg shader pipeline with a cached GXP set
status: Review
assignee: []
created_date: '2026-10-09 07:39'
updated_date: '2026-10-17 17:41'
labels:
  - handheld
  - pocketjs
milestone: m-23
dependencies:
  - ZN-490
  - ZN-471
ordinal: 214590
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GXM device kernel (clean-room): CDRAM and uncached blocks, frame rings released after the GPU, program registration and patching, MSAA 4x display surface drawn into directly, parameter buffer raised to 32 MB. Shaders written in Cg, compiled on the owner's console with SceShaccCg (libshacccg.suprx) at development time, cached as GXP keyed by source hash and shipped. Renderer: pack layouts for vita60, per-vertex sun lighting with normals, fog, sky, governor on near/mid distances. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The sample pack renders in Vita3K with scene counters (draws, triangles) matching the pack viewer
- [ ] #2 Cached GXPs are versioned; a missing GXP fails the build with the shader named
- [ ] #3 Hardware: 60 fps at 960x544 with 4x MSAA on the route, receipt recorded
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
First milestone only (the coordinator's brief): the 3D draw path is staged, the GXP compile is blocked on this machine. Done: SDL's colour blob inspected — gxm_shader_color_v holds exactly 3 parameters (aPosition, aColor, wvp, visible in the blob's string table) and SDL itself feeds aPosition with componentCount 2 (SDL_render_vita_gxm_tools.c), so it cannot take a z; new file targets/vita/gxm_3d.cpp (entrypoints zn_gxm_3d_init/zn_gxm_3d_draw: MVP column-major 16 floats, interleaved 7-float vertices x,y,z,r,g,b,a, u16 indices, sceGxmDraw over gxm_vita's context, depth state set and restored per draw); guarded accessor zn_gxm_3d_context in gxm_vita.cpp compiled out by default; build guard ZN_VITA_GXP_3D in next/targets/console/vita.cmake (default OFF, no change to the 2D build; ON without the blob fails configure naming the shader); shader sources staged targets/vita/shaders/color3d.vert/.frag + README.md with the compile method (vita-shader-compiler or SceShaccCg on a console, generate shaders/zn_gxp_3d.h); test next/tests/t0/vita_gxp_3d.sh (skips 77 while no blob, fails on an empty or non-GXP blob, passes when blobs are real).
Ran and seen: arm-vita-eabi-g++ -fsyntax-only of gxm_3d.cpp (SYNTAX-OK, with a declaration-only stub header, no bytes invented); gxm_vita.cpp.obj compiled clean inside the real VitaSDK core build (staged at 89%); tools/build-console-core vita fails afterwards at 'vita-elf-create: Cannot allocate 2520 bytes for SCE data at end of segment 0; segment 1 overlaps' (a pinned-SDK velf step, pre-existing: no VPK was ever produced in build/console-vita before this run, my change is not in the link); test exits 77 'no compiled pair (no vita-shader-compiler on this machine)'.
Blocked: no vita-shader-compiler anywhere (PATH, ~/VitaSDK/bin absent, pinned toolchain bin has no shader tool); the GXP pair can only come from the maintainer step in targets/vita/shaders/README.md, then build with -DZN_VITA_GXP_3D=ON. Not attempted: the zinc:3d pipeline wiring (ZN-495, ZN-477, later milestone).
<!-- SECTION:NOTES:END -->
