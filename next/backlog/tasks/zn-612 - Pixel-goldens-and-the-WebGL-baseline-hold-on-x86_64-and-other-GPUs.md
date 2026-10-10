---
id: ZN-612
title: Pixel goldens and the WebGL baseline hold on x86_64 and other GPUs
status: Done
assignee: []
created_date: '2026-10-10 07:27'
updated_date: '2026-10-10 22:12'
labels:
  - test
  - rendering
  - size-M
milestone: m-8
dependencies: []
priority: medium
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On the Intel Mac (x86_64, Intel UHD 630 + Radeon Pro 555X), three goldens recorded on Apple Silicon fail with no change in the code: three_3d (3d-model: 3 pixels, max diff 61; three-cubes: 5 pixels, max diff 1: FP contraction and libm), video (the first frame decoded by VideoToolbox: 20100 pixels, mae 0.62, psnr 37.9 dB), webgl_conformance (same total 695/787, but 5 pages regress on the Intel/AMD GL drivers: misc/uninitialized-test, conformance2/renderbuffers/multisampled-renderbuffer-initialization, conformance2/glsl3/matrix-row-major-dynamic-indexing, conformance2/glsl3/vector-dynamic-indexing-swizzled-lvalue, conformance2/textures/misc/tex-srgb-mipmap). Decide per case and record it: a tolerance (tools/pngdiff --tol / --max-diff) where the difference is rounding, a baseline per GPU family for the conformance pages, or a deterministic path (no FMA contraction in the 3D maths).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 three_3d, video and webgl_conformance pass on an Intel Mac
- [x] #2 a real regression (a shape moved or a colour changed beyond the tolerance) still fails each of them
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (2026-10-11), D82. Per case: three_3d compares within 1 per channel and 8 pixels (pngdiff --tol 1 --max-diff 8): 3d-model differs by 3 pixels (max 61, edge flips), three-cubes by 5 (max 1); every unit already builds with -ffp-contract=off, so the source left is the platform libm under Math.sin/cos (not provable here without an arm64 machine); follow-up ZN-703 (fdlibm like V8 and the sim) would let them compare exactly. video compares the picture (--crop 0,0,192,108) by PSNR >= 30 dB and mae <= 4 (new pngdiff --psnr / --mae): Intel decode 32.2 dB / 2.31 (VideoToolbox + FFmpeg's SIMD yuv2rgb); simulated regressions fail: 1 px shift 22.8 dB, R/B swap 16.9, +6 brightness mae 5.8, limited/full range 28.3, BT.601 as 709 29.5, nearest chroma 26.8; the decoder line must say 192 108. webgl_conformance: tools/webgl-conformance asks the context's unmasked vendor (ATI Technologies Inc. -> amd: the Radeon Pro 555X is the headless GPU here) and reads tests/golden/webgl/conformance-known-<family>.txt; its pages print KNOWN, the rest of the pass list still fails the gate. The five AMD pages: misc/uninitialized-test and multisampled-renderbuffer-initialization are ours (WebGL must zero what GL leaves undefined; Apple's driver zeroes memory): ZN-701; matrix-row-major-dynamic-indexing, vector-dynamic-indexing-swizzled-lvalue, tex-srgb-mipmap are driver bugs ANGLE rewrites around: ZN-702. Hang guards: multisample-corruption 90 -> 240 s (59 s alone here), complex-glsl-does-not-crash 20 -> 60 s (12 s alone), both timed out under load 9. AC1: three_3d, video and webgl_conformance PASS (tests/run --tier t1 --only each; conformance 694 of 787, 5 KNOWN). AC2: 3d-model shifted 1 px (15739 pixels) and tinted +3 fail; video shift/bright/swap fail; misc/uninitialized-test removed from the known list -> REGRESSION, exit 1. usage: n/a
<!-- SECTION:NOTES:END -->
