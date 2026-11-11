---
id: ZN-701
title: >-
  WebGL clears what the GL driver leaves undefined: copies outside the
  framebuffer, new renderbuffers
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-10 22:03'
updated_date: '2026-11-11 23:43'
labels:
  - webgl
  - bug
  - size-S
milestone: m-8
dependencies: []
ordinal: 57100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by ZN-612 on the Intel Mac's AMD driver: misc/uninitialized-test fails (copyTexImage2D and copyTexSubImage2D with a source rectangle partly outside the framebuffer: WebGL says the outside texels are zeros, GL leaves them undefined, src/gl passes the call through) and conformance2/renderbuffers/multisampled-renderbuffer-initialization fails (a new renderbuffer, multisampled or not, must read as zeros before its first draw: WebGL implementations clear it lazily). Apple's GL driver hands over zeroed memory, so both pass on Apple Silicon by luck. Clip the copy to the framebuffer and zero the rest; clear a renderbuffer (and a texture attached through framebufferTexture2D without data, if any case is left) before its first use, as browsers do. Then drop both pages from tests/golden/webgl/conformance-known-amd.txt.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 misc/uninitialized-test and multisampled-renderbuffer-initialization pass on the Intel Mac's AMD driver
- [ ] #2 the pass list holds 695 pages or more on Apple Silicon, no regression
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: cross-platform pass. (corrected: park proposed; it needs only the Raspberry Pi 3B+ or the Intel Mac, both available since 2026-11-07 (owner): cross-platform pass, not parked.)


2026-11-12 implementation (work/701): eager defined storage; no lazy resource lifecycle added. Uncompressed texture allocations/storage (all levels/faces/layers) upload zero chunks bounded by max(64 KiB, one row); typed scratch-FBO clears initialize color to zero, depth to one, stencil to zero, including multisample renderbuffers. RAII restores PBO/unpack layout, texture/RBO bindings, separate READ/DRAW FBOs and hostile clear masks/scissor/discard; indexed color masks are preserved. Driver errors remain visible and failed initialization does not advance resource metadata. Shared C++ WebGL entry points cover JS and native host rows; no glue/caller change.

Specification correction: copyTexSubImage2D/3D leaves the outside destination pixels UNTOUCHED. Only copyTexImage2D supplies zeros outside the framebuffer. Original destination bounds are validated before clipping; coordinate arithmetic is widened. A temporary zeroed image preserves copies between different levels of one texture. Direct in-bounds copies keep their original fast path. Read/copy/blit completeness uses READ independently of DRAW (WebGL 1 retains its FRAMEBUFFER spelling).

Research supplied by coordinator: https://registry.khronos.org/webgl/specs/latest/1.0/#READS_OUTSIDE_FRAMEBUFFER ; https://raw.githubusercontent.com/google/angle/main/src/libANGLE/renderer/gl/BlitGL.cpp ; https://raw.githubusercontent.com/mozilla/gecko-dev/master/dom/canvas/WebGLFramebuffer.cpp . Design and scoped coverage: docs/reports/webgl-storage-initialization.md.

Proof: tools/work-run 180 tools/build zn_webgl PASS, warning-free; final log .logs/701-build-final.log. Only the GL module was built. tools/work-run 40 env ZINC=<common>/build/zinc ZINC_ROOT=$PWD ZINC_WEBGL_LIB=$PWD/build/libzn_webgl.dylib tests/run --only webgl_initialization PASS (driver-spy C++ assertions plus actual small headless WebGL1/2 program); .logs/701-proof-final.log; the runner removes successful detail logs, so a separate bounded actual feature run is retained in .logs/701-feature-final.log (exit 0). Tests include allocation failure and bounded chunks, null reallocation, hostile unpack/PBO restoration, partial/full outside copies and extreme coordinates, original destination validation, nonzero subimage preservation, different-mip alias, 3D storage/copy, signed/unsigned integer color, indexed masks, depth1/stencil0 and MSAA resolve. Early fixture failures (indexed mask set before global colorMask; WebGL1 READ target normalization) were corrected; final proof supersedes those logs. No zinc check applies to native C++ and the raw browser-JS regression fixture.

Provenance: branch work/701 based on a61dcaf1a. Final module SHA256 23ecc6880b4cbe4fb22494ae383503cbc29701ab804dd8a0fb71e467da8bb7ff. Read-only common zinc SHA256 08bedbdc000150ace1221593f93f41e66d8a3d0306beaf62f059560daf69dae8 (coordinator confirms e31522ace refresh; brief's fe095... was older). All app/test/build runs bounded through the coordinator work-run; test fixture cleans its compiler temporary directory. No owned app/server remains. usage: n/a.

Review, AC1/AC2 remain unchecked: no AMD page run and no 695-page/full matrix campaign authorized. Known AMD failure entries unchanged. Allocation cost and performance on large textures are unmeasured; no timing or memory-performance claim. Initialization staging is bounded by construction and checked with driver spies.

Proposed tests (owner picks): bounded affected AMD uninitialized/multisampled-renderbuffer pages on the Intel Mac (seconds per page, RSS unmeasured); full Apple Silicon WebGL pass list >=695 pages at the chosen milestone (minutes, RSS unmeasured); GLES2/3 Pi and Linux real-driver focused initialization proof (seconds, RSS unmeasured). Coordinator later line: ZN-701 measure large texture allocation cost on a quiet machine before considering GPU-clear acceleration for renderable textures. No new task or known-failure removal.

<!-- SECTION:NOTES:END -->
