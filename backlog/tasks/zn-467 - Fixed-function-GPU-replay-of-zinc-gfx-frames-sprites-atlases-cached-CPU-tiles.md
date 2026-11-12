---
id: ZN-467
title: >-
  ff_replay: desktop CPU reference backend, T1 against the raster, counters in
  zinc -v
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-09 07:37'
updated_date: '2026-11-12 00:39'
labels:
  - gpu
  - handheld
  - handhelds
  - size-L
milestone: m-23
dependencies:
  - ZN-453
ordinal: 55300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-10-25):** AC1 CPU reference backend + T1 on hardware-psp/bouncing-ball scene dumps within tolerance; AC2 quads/tiles/cache hits in zinc -v; add gradients (vertex colours) and rounded CLIPs or document them as software. AC3 already ticked. Already there: targets/console/ff_replay.cpp; targets/psp/gu_psp.cpp; targets/n3ds/c3d_n3ds.cpp; commits 42e55368, d57004a0.

A shared module that turns HalCmdList (CLEAR, RECT, BORDER, SHADOW, LINE, TEXT, IMAGE, POLY, CLIP, UNCLIP) into quads for GPUs without fragment shaders: vertex-colour gradients, a glyph atlas (A4/A8), a corner atlas for radii and borders, scissor for rectangular clips, and CPU-rasterized tiles cached by CmdSig hash for POLY, SHADOW, radial gradients and rounded clips. Backend interface: upload texture, set scissor, draw quads, draw tile, present. A CPU reference backend runs it on the desktop for tests.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 on the layout fixtures and the bouncing-ball and kit-gallery scene dumps, the CPU reference backend matches runtime/raster.cpp within the display-gl tolerance (T1)
- [x] #2 quads per frame, tiles per frame and tile cache hits are reported by zinc -v
- [x] #3 the backend interface has no platform header in it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25 (owner: 'fais le support gpu de la psp et après de la 3ds'): targets/console/ff_replay.{h,cpp} is the shared replay, the platform-free half of targets/vita/gxm_vita.cpp (drawable, text through a 512x512 A8 glyph atlas, images with atlas boxes, flips, tint, alpha and filter, rectangular clips cut on the CPU). Backend interface: texture(), glyphs(), glyph_memory(), glyphs_written(), draw_quad(); no platform header (AC #3). Used by targets/psp/gu_psp.cpp (ZN-468) and targets/n3ds/c3d_n3ds.cpp (ZN-469). A frame with RECT radius or gradient, BORDER, SHADOW, LINE, POLY, XFORM, layer images or non-normal blends is not drawable: the HAL rasterizes it and the GPU shows it as one texture. Not done yet: the corner atlas for radii and borders, the CPU tiles cached by CmdSig, the desktop CPU reference backend and its T1 against runtime/raster.cpp (AC #1), the quads/tiles/cache-hit counters in zinc -v (AC #2). gxm_vita.cpp still has its own copy (the other session moves the Vita to vitaGL); it can call ff_replay once that settles.

2026-10-25 (owner: 'go' on the corner atlas): the single-colour shapes are on the GPU without new formulas: ff_replay asks runtime/raster.cpp to draw the command once in white on black (RECT with a radius, BORDER, SHADOW, POLY without gradient), keeps the coverage in a second 512x512 atlas (atlas 1) keyed by the shape and its pixel fractions (a POLY by its absolute points), and stores only the longest runs of equal columns and rows once: a card of any size is its corners plus a 9-slice of at most 9 quads. The atlas is emptied when full, only between frames (quads_pending). A refused command is named once on the log ('gpu replay: a frame with a ... is rasterized in software'). Proof: examples/hardware-psp and examples/hardware-n3ds, every page in PPSSPP and Azahar, no frame left to the software raster; hardware-psp identical to the software path but its clock (tolerance 8); PSP worst frame CPU 15.5 ms -> 1.6 ms. Left in software: gradients (RECT grad, paint records), rounded CLIPs, XFORM, LINE, STROKE, images with a radius or a blend mode. Texture edges: the last row and column are repeated beyond the image (the raster clamps; zeros made filtered edges fade).
Review 2026-10-25: done-partly. Shared replay exists (ff_replay.{h,cpp}, glyph atlas, coverage atlas for corners/borders/shadows/polys, backend interface without platform header) and drives the GE and PICA. Left: CPU reference backend with a T1 against runtime/raster.cpp, counters in zinc -v, gradients and rounded clips. Evidence: targets/console/ff_replay.cpp; targets/psp/gu_psp.cpp; targets/n3ds/c3d_n3ds.cpp; commits 42e55368, d57004a0

2026-11-12 worker (branch work/467-reference, base 21dc94b9d): added standalone desktop `targets/console/ff_cpu.{h,cpp}` implementing the existing backend with vendored SDL3; no new production dependency or engine/HAL/main edit. Textures/atlases, vertex gradients, tint, alpha, nearest/linear sampling and flips go through SDL. The SDL software geometry implementation does not honor linear filtering, discovered by the exact sampler assertion: uniform texture quads therefore use SDL's software texture blitter; only gradient quads need geometry. Uploads replace cached image textures only after success, and SDL failures invalidate coverage caches for retry. A single CPU backend owns its SDL objects with RAII; invalid/nested construction and backend restart are covered.

Research (delegated read-only pass, inherited model because no Sonnet backend was available): https://wiki.libsdl.org/SDL3/SDL_CreateSoftwareRenderer and https://wiki.libsdl.org/SDL3/SDL_RenderGeometry support a windowless surface and textured vertex colours. https://github.com/bkaradzic/bgfx/blob/master/src/renderer_noop.cpp is only a no-op contract example, not a pixel reference. Decision proposed for coordinator: reuse SDL3 (weighted RULES scores fit/perf/size/maintainability/supply/portability/effort 5/3/5/5/5/4/4 = 62) rather than implement another quad rasterizer (4/3/5/2/5/5/2 = 52). Revisit if the full tolerance fixture pass finds an SDL coverage/sampling mismatch; no speed claim.

AC2: `begin_frame`/`end_frame` surround PSP presentation (including full software fallback quad), and the 3DS's actual GPU frame (both eyes and bottom surfaces together). Failed 3DS frame creation returns before replay. Successful GPU init resets shared glyph/shape cache when atlas memory is replaced. Quads count emitted nonempty clipped quads, tiles count shape draws, cache hits count those draws prepared in an earlier frame, never validation/prewarming lookups. `end_frame` logs once for ZINC_LOG info/debug/trace; `src/main.cpp:2567-2568` already maps -v/-vv to that variable, both console HALs' hal_env use getenv. Native test proves exact log/no-log setting and one report per two-list frame. Hardware CLI transport/execution remains unrun.

Proof: bounded `/Users/mowmow/Lab/zinc/tools/work-run 55 env ZINC=/Users/mowmow/Lab/zinc/.claude/worktrees/agent-aae96db4e67d4b8e6/build/zinc ZINC_ROOT=$PWD ZINC_HEADLESS=1 tests/run --only ff_cpu` passed 1/1; durable `.logs/ff467/t0-final.log`. Final standalone feature invocation of the same exact test, `.logs/ff467/feature-final.log`: maximum channel difference 1 within tolerance 8 on a 32x24 two-list frame, cold/warm cache, clip, gradient, rounded shape atlas coverage, dynamic image refresh/deletion, alpha, nearest/linear filtering, full quad and second-backend restart assertions pass. No warnings under Apple clang 17 with -Wall -Wextra. SDL archive reused read-only from common binary's sibling `third_party/SDL3/libSDL3.a`, SHA256 cc1bcad05c09512c9921ad03b4fd6cfc1b00b9f25f3441a07f3f563c4e5efc9a. Engine binary not executed/rebuilt; no engine parity claim. Usage: n/a.

AC1 stays unchecked, status Review: the literal layout/bouncing-ball/kit-gallery scene-dump T1 tolerance campaign needs the owner's selected milestone. Existing vertex gradients are retained; rounded CLIPs/radial and paint gradients/transforms/lines/unsupported image effects remain explicitly documented whole-frame software fallbacks (`docs/reports/zinc-next-ff-reference.md`). No suite, T1/T2, demo, benchmark, conformance, fuzz, CI, console cross build or hardware run was started. No performance or memory measurement; no owned process remains. Proposed later line: ZN-467: run the reference tolerance campaign and PSP/3DS verbose/frame-reset smoke at a selected milestone; SDL edge rounding and real GPU execution remain unproven.

Proposed tests: standalone tiny reference `tests/run --only ff_cpu` on Linux with its existing SDL archive (seconds, memory unmeasured); owner-selected layout/bouncing-ball/kit-gallery dump harness against raster tolerance8 (T1, harness not yet written, duration/memory unmeasured); PSP/3DS existing hardware apps with ZINC_LOG=info and software fallback/stereo/bottom surfaces (bounded 10s each, memory unmeasured). No broad image campaign or new demo test was added.
<!-- SECTION:NOTES:END -->
