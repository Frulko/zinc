---
id: ZN-576
title: 'MSAA default framebuffer for WebGL (antialias: true)'
status: Done
assignee: []
created_date: '2026-10-09 08:12'
updated_date: '2026-10-11 08:04'
labels:
  - games
  - js
  - size-S
milestone: m-22
dependencies:
  - ZN-411
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
antialias: true is reported back as false and SAMPLES is 0 (MAX_SAMPLES is 4): every 3D library relying on default MSAA renders jagged edges. Multisampled default framebuffer up to MAX_SAMPLES, resolved before presentation (the GPU present of ZN-411), readPixels and texImage2D(canvas). (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 getContextAttributes().antialias === true when requested and supported
- [x] #2 three.js edge test against Chrome SSIM >= 0.95
- [x] #3 WebGL conformance not lower
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (2026-10-11). The default framebuffer is multisampled when antialias is asked for (WebGL's default; zinc:gl's WebGLContextAttributes.antialias now true too, bit 32): src/gl/offscreen.cpp setSamples(4) makes a framebuffer of min(4, MAX_SAMPLES) samples (RGBA8 + DEPTH24_STENCIL8 renderbuffers) that WebGL draws into; the old single-sampled framebuffer becomes its resolved copy. resolve() blits it before the GPU present (readScaledAsync), read() (the CPU present, zinc:gl), and Offscreen::ReadResolved puts the copy under readPixels, readPixelsToBuffer, copyTexImage2D, copyTexSubImage2D and copyTexSubImage3D of the canvas. blitFramebuffer treats the canvas as multisampled (a blit into it is INVALID_OPERATION, as GLES 3 and Chrome; the macOS driver accepted it). GLES 2 has no multisampled renderbuffers: antialias is reported false there. AC1: getContextAttributes().antialias true, SAMPLES 4, SAMPLE_BUFFERS 1 by default, false/0 with antialias: false (tests/golden/webgl/antialias.js in tests/t1/webgl_js.sh, also: a slanted edge has blended pixels only with antialias, copyTexImage2D copies the resolved pixels, the blit error). AC2: tools/three-compare has an antialiased scene, edges (thin slanted bars, Chrome reference rendered with --update-refs edges): SSIM 1.000 against Chrome, 0.937 when zinc renders it without antialias (the gate for it is 0.95); tests/three/run.mjs now creates the context with the scene's antialias (the first getContext's attributes stay, so the other scenes had become multisampled). AC3: tests/t1/webgl_conformance.sh passes (no page of the pass list regressed). Test changes: webgl2_tex.js and the webgl-surface page ask antialias: false (a blit into the canvas; a frame hash that must not depend on the GPU's sample pattern). Tests: webgl_js, webgl2_js, webgl2_tex, webgl1_core, webgl_present, webgl_surface, webgl_libs, gl_cube, three, three_3d, webenv_*, webgl_gizmo, webgl_module, webgl_studio, zinc_gl_api, zinc_gl_api_tour pass. usage: n/a
<!-- SECTION:NOTES:END -->
