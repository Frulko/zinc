---
id: ZN-612
title: Pixel goldens and the WebGL baseline hold on x86_64 and other GPUs
status: Backlog
assignee: []
created_date: '2026-10-10 07:27'
labels:
  - test
  - rendering
  - size-M
milestone: m-8
dependencies: []
priority: medium
ordinal: 168030
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On the Intel Mac (x86_64, Intel UHD 630 + Radeon Pro 555X), three goldens recorded on Apple Silicon fail with no change in the code: three_3d (3d-model: 3 pixels, max diff 61; three-cubes: 5 pixels, max diff 1: FP contraction and libm), video (the first frame decoded by VideoToolbox: 20100 pixels, mae 0.62, psnr 37.9 dB), webgl_conformance (same total 695/787, but 5 pages regress on the Intel/AMD GL drivers: misc/uninitialized-test, conformance2/renderbuffers/multisampled-renderbuffer-initialization, conformance2/glsl3/matrix-row-major-dynamic-indexing, conformance2/glsl3/vector-dynamic-indexing-swizzled-lvalue, conformance2/textures/misc/tex-srgb-mipmap). Decide per case and record it: a tolerance (tools/pngdiff --tol / --max-diff) where the difference is rounding, a baseline per GPU family for the conformance pages, or a deterministic path (no FMA contraction in the 3D maths).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 three_3d, video and webgl_conformance pass on an Intel Mac
- [ ] #2 a real regression (a shape moved or a colour changed beyond the tolerance) still fails each of them
<!-- AC:END -->
