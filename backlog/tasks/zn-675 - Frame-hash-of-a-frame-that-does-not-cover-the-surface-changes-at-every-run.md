---
id: ZN-675
title: Frame hash of a frame that does not cover the surface changes at every run
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 19:21'
updated_date: '2026-11-09 04:28'
labels:
  - testing
  - bug
  - size-S
dependencies: []
ordinal: 11500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Follow-up of ZN-432, D73.) grab() renders into uncleared memory, so a program that does not paint the whole surface gets a different frame hash every run (tests/conformance/canvas2d.ts).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 tests/conformance/canvas2d.ts gives the same hash over 10 runs
- [x] #2 a regression test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (2026-11-09). Cause: grab() (runtime/gfx.cpp) rasterized the frame into hal_alloc'd memory that was never cleared, so the pixels a frame does not paint kept whatever the allocator handed back (reused blocks: a new hash at every run). Fix at the allocation: grab() zeroes its buffer, as the displays' surfaces already are (hal_sdl calloc's its framebuffer, the GL path clears, render_rows clears when no frame is shown, scene_replay zeroes): every capture path (ZINC_SHOT, zinc capture, ZINC_FRAMEHASH, DevTools screenshots, zbench sections) goes through grab(). Cost: one memset of the capture, only when capturing.
Proof: tests/conformance/canvas2d.ts, 10 headless runs: one hash (7dc67819f32ac043), the same on --interp and --engine quickjs; before, 4 runs gave 4 hashes. Regression test: tests/t0/framehash_corner.sh (a program that paints a 16x16 corner, two runs on the interpreter and one on QuickJS, each equal to the hash of the same corner on a frame cleared to black; the old binary gave two different hashes on two runs).
Goldens: none re-recorded. A golden hash can only change if its frame leaves pixels unpainted and the old capture landed on deterministic memory (a fresh mmap: zeros, unchanged now; or the previous grab's freed block: the previous frame, now black). Not run here: see Proposed tests.
Web search: Skia SkSurfaces::Raster now documents raster pixels as zeroed before use (https://raw.githubusercontent.com/google/skia/main/include/core/SkSurface.h; the m75 docs said not initialized: https://skia.googlesource.com/skia/+/chrome/m75/site/user/api/SkSurface_Reference.md); the HTML canvas bitmap starts transparent black (https://html.spec.whatwg.org/multipage/canvas.html).
Proposed tests: the T0 tests that compare frame hashes, at the milestone (animated_native, assets_groups, app_library, console_core, emoji_text, fuse; under a minute each, < 500 MB) and the pixel canary (tools/proto-capture --canary), to confirm no golden frame relied on uncleared memory.
<!-- SECTION:NOTES:END -->
