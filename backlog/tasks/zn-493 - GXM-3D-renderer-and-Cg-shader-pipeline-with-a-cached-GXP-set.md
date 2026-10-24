---
id: ZN-493
title: 'Vita GXM 3D renderer for cooked packs: prove a triangle on hardware, then the pack renderer'
status: Review
assignee: []
created_date: '2026-10-09 07:39'
updated_date: '2026-10-25 01:53'
labels:
  - handheld
  - pocketjs
milestone: m-23
dependencies:
  - ZN-490
  - ZN-471
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** Set status Backlog. Next: draw one 3D triangle with the committed GXPs on the owner's Vita (Vita3K cannot), then pack layouts, fog, MSAA 4x. Decide with ZN-477 which path zinc:3d takes (GXM vs vitaGL).

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
First milestone only (the coordinator's brief): the 3D draw path is staged, the GXP compile is blocked on this machine. Done: SDL's colour blob inspected — gxm_shader_color_v holds exactly 3 parameters (aPosition, aColor, wvp, visible in the blob's string table) and SDL itself feeds aPosition with componentCount 2 (SDL_render_vita_gxm_tools.c), so it cannot take a z; new file targets/vita/gxm_3d.cpp (entrypoints zn_gxm_3d_init/zn_gxm_3d_draw: MVP column-major 16 floats, interleaved 7-float vertices x,y,z,r,g,b,a, u16 indices, sceGxmDraw over gxm_vita's context, depth state set and restored per draw); guarded accessor zn_gxm_3d_context in gxm_vita.cpp compiled out by default; build guard ZN_VITA_GXP_3D in targets/console/vita.cmake (default OFF, no change to the 2D build; ON without the blob fails configure naming the shader); shader sources staged targets/vita/shaders/color3d.vert/.frag + README.md with the compile method (vita-shader-compiler or SceShaccCg on a console, generate shaders/zn_gxp_3d.h); test tests/t0/vita_gxp_3d.sh (skips 77 while no blob, fails on an empty or non-GXP blob, passes when blobs are real).
Ran and seen: arm-vita-eabi-g++ -fsyntax-only of gxm_3d.cpp (SYNTAX-OK, with a declaration-only stub header, no bytes invented); gxm_vita.cpp.obj compiled clean inside the real VitaSDK core build (staged at 89%); tools/build-console-core vita fails afterwards at 'vita-elf-create: Cannot allocate 2520 bytes for SCE data at end of segment 0; segment 1 overlaps' (a pinned-SDK velf step, pre-existing: no VPK was ever produced in build/console-vita before this run, my change is not in the link); test exits 77 'no compiled pair (no vita-shader-compiler on this machine)'.
Blocked: no vita-shader-compiler anywhere (PATH, ~/VitaSDK/bin absent, pinned toolchain bin has no shader tool); the GXP pair can only come from the maintainer step in targets/vita/shaders/README.md, then build with -DZN_VITA_GXP_3D=ON. Not attempted: the zinc:3d pipeline wiring (ZN-495, ZN-477, later milestone).

ZN-493 first milestone integrated on main via cherry-pick: targets/vita/gxm_3d.cpp draw entry, gxp3d cmake guard, tests/t0/vita_gxp_3d.sh. Second milestone: blobs color3d_v.gxp (504B) and color3d_f.gxp (228B) generated on the build machine by glslang 15.1 (vendored) + psp2spvc 1.1 build, and committed with the shader sources (color3d.vert/.frag rewritten as Vulkan-ES 310 with a Wvp UBO block); C++ updated to look up Wvp; tools/build-console-core gains --gxp3d. Vita core builds with -DZN_VITA_GXP_3D=ON from the real blobs; the shader test passes. Remaining for the full ZN-493: on-device / emulator proof of a drawn 3D triangle and the ZN-495/ZN-477 zinc:3d wiring.

Debug session 2 (Vita3K, ZINC_VITA_GPU_PROBE probes in gxm_vita.cpp): all GXM calls return SCE_OK (begin/end/pad/queue all 0x00000000), the replay builds the command list (27 quads, 4 batches), the display queue fires exactly one entry (displayCallback base 0x60000000, the first CDRAM buffer), sceDisplaySetFrameBuf is called from OUR callback, but the CDRAM colour surface stays black across all 3 buffers over 30 frames and the display queue does not process further entries.
Vita3K log is the smoking gun: 'Stubbed sceGxmMapVertexUsseMemory' and 'Stubbed sceGxmMapFragmentUsseMemory - always return success'. The patcher path we use therefore does not reach the GPU emulation on this Vita3K build. Software path fully paints (standalone probe: hello with ZINC_VITA_SOFT_FRAMES=10000 shows content, 59.8fps), so the shot path and the display library are fine and the failure is only in the GXM colour surface.
Next probe: a standalone (bypass the shader patcher, write the SDL 2D vertex/loong pair directly via sceGxmSetVertexProgram with the hardcoded uniform buffer) program to see whether raw draws paint at all on this emulator. Alternative: try the pinned emu's OpenGL backend instead of MoltenVK/Metal, or run the pin's own SDL test app.
Review 2026-10-25: rewrite. Status Review but nothing is provable yet: first milestone staged, GXP blobs built, Vita3K stubs the GXM memory calls so no 3D proof. Back to Backlog; GXM 2D now works on hardware, so the proof moves to the owner's Vita. Evidence: targets/vita/gxm_3d.cpp; targets/vita/shaders; tests/t0/vita_gxp_3d.sh; commits 761e5f8d, 903153a6
<!-- SECTION:NOTES:END -->
