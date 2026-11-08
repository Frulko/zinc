---
id: ZN-1042
title: Canvas 2D fidelity and speed for p5 and Phaser sketches
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:38'
updated_date: '2026-11-08 23:35'
labels:
  - canvas
  - perf
  - size-M
milestone: m-8
dependencies: []
ordinal: 7600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
canvas2d gaps and costs seen with the JS libraries.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-570: showing a 2D canvas reads the whole bitmap back every frame (1.7 ms at 640 x 480); a dirty flag in `canvas2d.cpp` would skip unchanged frames.
- ZN-570: `drawImage` is always bicubic; pixel-art games need nearest-neighbour when `imageSmoothingEnabled` is false.
- ZN-570: no `Path2D`, no italic or bold synthesis, no bold monospaced face, no `toDataURL` (ZN-572).
- ZN-572: a direct loop for an unrotated `drawImage`; a sprite still goes through `paint_pixel` and the general blend for each pixel (Phaser CANVAS is 4.5 times its floor).
- ZN-572: web environment: a script element added right after Phaser runs between the two data: pictures of Phaser's blend-mode probe, so a CANVAS game draws MULTIPLY and SCREEN source-over; settle picture loads before the next script element runs.
- ZN-572: the direct drawImage loop converts a row of the picture to float colours for every row drawn (half the time with the nearest pixel); keep converted pictures by stamp, or blend from bytes.
- ZN-572: a pattern under a scale is filtered over 16 pixels where Chrome takes 4; CanvasPattern.setTransform does nothing; the CSS filter subset; a shadow under a blend mode is not blended; a sprite under a blend mode or a clip takes the general loop.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 imageSmoothingEnabled=false draws nearest-neighbour; Path2D exists; drawImage direct loop for unrotated images keeps converted rows
- [x] #2 Showing a 2D canvas skips an unchanged frame (dirty flag)
- [x] #3 Pattern under scale filters like Chrome; setTransform works
- [x] #4 Phaser CANVAS blend modes survive picture load order in the web env
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-09 (worktree agent).

Research (sonnet sub-agent): Phaser 3.80/3.90 CanvasFeatures.checkBlendMode loads two 4x1 data: PNGs nested in onload, draws them 'multiply' and reads pixel (2,0); supportNewBlendModes stays false until both loads fire, and the CanvasRenderer reads it once when the game boots (https://github.com/phaserjs/phaser/blob/v3.80.1/src/device/CanvasFeatures.js). Chrome samples with imageSmoothingQuality 'low' = bilinear, no mipmaps, nearest when imageSmoothingEnabled is false; a CanvasPattern goes through the same image shader (4 taps), pattern space = pattern matrix then the CTM at fill time (https://skia.googlesource.com/skia/+/main/include/core/SkSamplingOptions.h, skia-canvas#85). nanosvg's path tokenizer (zlib) is the reference for SVG path pitfalls (arc flags without separators); our Path2D parser already handles them. Integer premultiplied blending (Skia lowp) would be the next step for blits.

State found: Path2D, imageSmoothingEnabled=false (nearest), toDataURL and the dirty flag (Canvas version/shown in src/qjs/canvas2d.cpp js_present: an unchanged canvas is not read back) were already done by ZN-572.

Done here (canvas_ity ZINC patch 10, zinc.patch regenerated from upstream 8be29cb, sha checked):
- #1 draw_image's own loop keeps the two converted rows of the picture while they serve (swap when moving down a row) and mixes them once per canvas row: no texel conversion per canvas row. Indicative (load 3-4, no other build): 2000 sprites 32->128, nearest 51.7 -> 49.8 ms, bilinear 67.1 -> 62.6 ms; the blend loop is the floor (1.5 ns a pixel), so no changelog line for speed.
- #3 patterns: nearest when smoothing is off, else bilinear over 4 wrapped pixels at any scale (was the 16-tap bicubic); CanvasPattern.setTransform(DOMMatrix2DInit) through c2d.pattern(..., a..f) and canvas::set_pattern_transform (a matrix with no inverse paints nothing).
- #4 lib/std/webenv.js: a script element runs once the data:/blob:/file: pictures being loaded (and those their load events start) have settled (afterPictures). Proof: Phaser CANVAS postBoot prints supportNewBlendModes true, blendModes MULTIPLY 'multiply' (main tree binary: false, 'source-over'). tests/golden/webenv/canvas2d/libs/phasercanvas.js no longer waits 8 turns: two plain script elements.
- #2 verified in code (ZN-572).

Test: tests/t0/webenv_canvas_fidelity.sh (pattern x4 bilinear values, setTransform move/scale/singular, drawImage x4 nearest and bilinear across and down, script after nested data: pictures), PASS. Short run: phasercanvas page 6 frames headless, blend modes visible in the frame.

Later (not in this task's criteria): italic and bold synthesis, a bold monospaced face; imageSmoothingQuality medium/high (mipmaps); the CSS filter subset; a shadow under a blend mode is not blended; a sprite under a blend mode or a clip takes the general loop; integer premultiplied blending for blits.

Proposed tests: tests/t1/webenv_canvas2d_libs.sh (phasercanvas page without the wait, SSIM >= 0.97 against Chrome; 20 s, 300 MB); tests/t1/webenv_canvas2d_full.sh (patterns now bilinear: its pattern scene may need re-blessing against Chrome; 20 s, 300 MB).
<!-- SECTION:NOTES:END -->
