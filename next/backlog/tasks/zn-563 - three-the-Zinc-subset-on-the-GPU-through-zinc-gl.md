---
id: ZN-563
title: 'zinc:3d and three (the Zinc subset) on the GPU through zinc:gl'
status: Done
assignee: []
created_date: '2026-10-09 07:59'
updated_date: '2026-10-10 13:52'
labels:
  - perf
  - 3d
milestone: m-21
dependencies:
  - ZN-562
priority: high
ordinal: 342270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
plugins/three is three.js's API written in Zinc, compiled AOT like any Zinc code, but it renders with zinc:3d on the CPU. Add a GPU renderer to it on zinc:gl: buffers per geometry, one program per material kind (basic, Lambert, Phong, Standard where the tier allows), uniforms from the scene graph, depth, textures, picking unchanged; zinc:3d stays the renderer without a GPU and the oracle. The same three-style program then runs with native logic and GPU drawing, so the limit is the GPU, not JavaScript. Feeds RPI-3D-10 (cooked packs) and the handheld zinc:3d backends.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 examples/three/cubes and examples/three/gltf-viewer render on the GPU backend in AOT with SSIM >= 0.95 against the zinc:3d frames
- [x] #2 1000 meshes animate at 60 fps on macOS and the CPU time per frame is recorded against real three.js on QuickJS for the same scene
- [x] #3 the zinc:3d path and its goldens stay unchanged; the renderer is chosen by tier or zinc.json
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner 2026-10-09: 'why is zinc:3d not GPU? yes to everything (a, b, c, d)'. Scope widened: the GPU renderer goes into zinc:3d itself, as a new native backend next to render3d.host/rpi1/esp32/wasm.cpp (render3d.gl.cpp on zinc:gl / GLES2-GLES3), so plugins/three, which draws through zinc:3d, gets the GPU for free; the handheld backends (render3d.psp/vita/n3ds/ios, ZN-453..511) follow the same interface. The software backend stays for targets without a GPU and as the oracle.

Done 2026-10-10 (usage: 2395344 in / 619253804 cached / 1188643 out tokens, 1378 turns, session total).
- plugins/3d/native/render3d.gl.cpp: the GPU backend of zinc:3d (GL 3.2 core on macOS, GLES 3 subset), selected by plugin.json native.impl.macos (Next only: the prototype keeps render3d.host.cpp); it includes render3d.host.cpp (fallback, oracle) and derives from its Engine (meshes built there, lights parsed there). Option renderer: auto (GPU unless ZINC_DETERMINISTIC) / software / gpu, ZINC_3D overrides; no context -> software. Programs per kind: unlit/lit (Lambert per vertex, clamped) x smooth/flat (dFdx/dFdy face normal) x textured x vertex colours; noperspective colour like the software spans. render3d.host.cpp: viewProjection() and presentImage() extracted, gpuRenderer() hook; software output unchanged (AOT software frame = interpreter frame, 0 pixels differ).
- Read: async through a pixel buffer per target mapped one frame later (sync in deterministic runs, ZINC_GL_PRESENT as WebGL). Found on the Intel Mac: GL_BGRA reads are converted on the CPU synchronously (2.5 ms at 800x500) -> RGBA bytes with the shaders writing blue first (0.07 ms); a pixel buffer read from an RGBA8 renderbuffer is garbage on Apple's GL -> colour attachment is a texture.
- AC1: tests/t1/three_gpu.sh (AOT, ZINC_3D=gpu): three/cubes SSIM 0.9999, gltf-viewer 0.9984 against tests/golden/examples; async frame 31 vs golden 30 0.9999; selection by env / zinc.json / deterministic checked (6 cases). Also 3d/cubes 0.9930, 3d/model 0.9911 (texel edges, the triangle count text).
- AC2: bench/three_many.ts (1000 cubes, 10 Lambert materials, 2 lights, 800x500, AOT): GPU 2.43 ms CPU/frame headless (406 fps), 2.9 ms and 60.0 fps in a window (vsync); software 3.18 ms; real three.js r186 on QuickJS bench/qjs/three_many.mjs 73.3 ms (70.6 render + 2.6 read). three/cubes 0.36 ms GPU vs 0.51 software per render. docs/reports/zinc-next-perf.md, docs/plugins/3d.md.
- AC3: render3d.host.cpp logic untouched; three_3d fails as before on this machine (3d/model, three/cubes frame 30: known, RESUME); renderer by zinc.json/tier (auto = GPU where the target has the backend: macOS now).
- Bugs fixed on the way: (1) ZN-399's inline width()/height() in AOT read surf_w before the surface started (a top-level window.innerWidth gave 320x240): zn::host::startGfx() first; regression check in tests/t1/host_direct.sh. (2) AOT precompiled header never built since d54de958 (-Wl,-x in the compile flags: 'cannot specify -o when generating multiple output files' at every build): linker flags moved to the link; check in tests/t1/aot.sh. (3) targets/macos/hal_sdl.cpp: the GL window present ran with whatever context was current (zinc:3d's, zinc:gl's) and swapped it, without vsync (111 fps): it now makes its context current and puts the caller's back (GlCurrent).
- tools/pngdiff --ssim MIN (the SSIM of tools/three-compare, which now uses it). Plugins get the SDL3 include on macOS (plugin_build).
- Not verified: zinc:gl's gl-cube in a real window after the HAL fix (the window was covered on screen; window_renderer passes). Decision D58. Follow-ups: ZN-563.01 Linux, .02 Pi GLES2, .03 wasm (deferred), .04 Phong/Standard materials.
<!-- SECTION:NOTES:END -->
