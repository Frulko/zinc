---
id: ZN-666
title: The 30 style scenes through the GL replay
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-10 18:49'
updated_date: '2026-11-08 23:23'
labels:
  - gpu
  - ui
  - testing
  - size-S
dependencies: []
ordinal: 6900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(From the backlog review of 2026-10-10, docs/reports/backlog-review-2026-10-10.md.) The UI style suite is compared on the software raster only; the window renders through the GL replay, so a style that draws wrong on the GPU is not seen by a test.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 each style scene rendered through the GL replay is within the display-gl tolerance of its software golden, or listed as known with its pixel count
- [x] #2 the test skips (77) without a GL context
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-09 (worker agent): the test is written, AC1 needs its one full run, which the coordinator's rules keep for the owner's milestone. tests/t1/ui_style_gl.sh: each tests/golden/ui-style scene drawn by display-gl's GL replay (ZINC_DISPLAY=gl ZINC_RENDERER=gl, 240x160, 3 frames) and by the software raster at the GL frame's pixel scale (ZINC_SCALE = GL width / 240: the window density times display-gl's upscale, 4 on the M1 Pro), compared with tools/glcompare against display-gl's tolerance (gl_renderer.sh: 5% over 24, mae 3). Scenes beyond it are rows of tests/golden/ui-style/gl.known (scene, %, mae) that may not grow; UI_STYLE_GL_BLESS=1 writes the file from a run; UI_STYLE_GL_ONLY='a b' runs some scenes. Matching the scale matters: at scale 1 text-sizes was 4.6% / 3.5 off (text made at 4x on the GPU), at the matched scale it is exact.
Proof so far: radius, shadow, text-sizes, ring-mouse, sticky-50 all within tolerance (text-sizes exact, max 0); AC2: SDL_VIDEO_DRIVER=dummy gives 'skipped: no GL context here' and exit 77; a context whose replay refuses (using cpu) fails instead.
Next command (owner, alone on the machine, ~1-2 min, <300 MB): ZINC=build/zinc tests/t1/ui_style_gl.sh; if scenes fail for a reason not worth fixing now, UI_STYLE_GL_BLESS=1 ZINC=build/zinc tests/t1/ui_style_gl.sh writes gl.known (commit it with the task, tick AC1, Done); a scene that draws wrong on the GPU is a replay bug to fix first.
Research (sonnet, 2026-11-09): Skia Gold fuzzy matching (max differing pixels + per-pixel delta, Sobel edge filter: https://chromium.googlesource.com/chromium/src/+/main/ui/base/test/skia_gold_matching_algorithm.h), Gecko/WPT reftests fuzzy(maxDifference, totalPixels); per-test tolerances, text differs most. Kept display-gl's existing per-pixel/mae policy and a 'known' list like TESTING.md's.
Proposed tests: tests/t1/ui_style_gl.sh (30 scenes x 2 runs, windowed GL, ~1-2 min, <300 MB).
<!-- SECTION:NOTES:END -->
