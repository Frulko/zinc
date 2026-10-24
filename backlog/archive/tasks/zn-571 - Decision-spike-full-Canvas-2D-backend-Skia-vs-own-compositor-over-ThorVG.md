---
id: ZN-571
title: 'Decision spike: full Canvas 2D backend (Skia vs own compositor over ThorVG)'
status: Review
assignee: []
created_date: '2026-10-09 08:11'
updated_date: '2026-10-25 01:53'
labels:
  - games
  - js
  - decision
  - size-M
milestone: m-22
dependencies:
  - ZN-570
ordinal: 69000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The full 2D spec (26 composite modes, path clip, shadows, CSS filters, patterns) needs a real backend. Candidates from the report: Skia (BSD-3, full fidelity, Ganesh GL/GLES and CPU raster, GN build, 3-8 MiB core claimed; skia-canvas 22 MB and @napi-rs/canvas 28 MB measured with ICU and codecs) and an own compositor over ThorVG SW coverage (MIT, ~0.3-0.5 MB, no Porter-Duff ops or filters in ThorVG). Build pinned ICU-free Skia for macOS arm64, Linux x86_64/arm64 and armhf Cortex-A53, prototype the other route, measure size, build time and a 2D benchmark; record a D-entry with RULES.md scores. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 sizes, build times and frame times (p5 300 shapes, Phaser CANVAS bunnymark) for both routes on two targets
- [ ] #2 decision recorded in docs/reports/zinc-next-decisions.md with scores and a revisit condition
- [x] #3 licences and SBOM entries listed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-11, parallel agent (worktree). DECISION TO RECORD (no number taken here; the coordinator writes it in zinc-next-decisions.md): the full Canvas 2D tier stays on canvas_ity (ISC, the backend of D98), patched where the libraries are slow and completed in our own layer (src/qjs/canvas2d.cpp, lib/std/webenv.js). Neither Skia nor a compositor over ThorVG is vendored.

THE MEASURE THAT DECIDES: what the library and QuickJS cost with a context that does nothing. p5.js 1.11.13 in 2D mode, 800 x 600, 1,000 filled and stroked ellipses and two lines of text, time inside draw(), median of 100 frames after 20: 29.8, 35.6, 31.0 and 37.3 ms with every method and style setter of the context replaced by an empty function. That is 27 to 33 frames a second before a single pixel is drawn: no backend reaches the 60 of ZN-572's third criterion on QuickJS, Skia included, so speed of the rasteriser cannot be what a 6 to 20 MB library is bought for. Phaser 3.90 with type CANVAS, 500 sprites of 26 x 37 and a Text set every frame: 12.5 to 21 ms with the painting calls empty, against 11 to 19 ms for the same scene on WebGL drawn in full.
LOAD: every number was taken beside other trees building: load average 6.2 to 11 (6 cores), CPU_Speed_Limit of pmset -g therm between 35 and 66, so the wall times are about twice those of a quiet machine and move by 30 % from run to run. Each line below is a pair taken back to back; the ratio to the floor is what compares.

BEFORE (main at d696af8e, canvas_ity as ZN-570 left it), drawn / painting calls empty, ms: p5 300 mixed shapes 43.1 / 7.7 (5.6 times); p5 1,000 ellipses 269.6 / 50.5 (5.3 times); Phaser CANVAS 500 sprites 189.6 / 16.9 (11.2 times); Phaser WEBGL 18.7. A first run at a load of 6 to 7, measured from one requestAnimationFrame to the next: 85, 310, 132 and 12.3 ms.
WHERE IT WENT (sample, 5 s): each fill or stroke walked the clip mask's two entries for every row of the canvas, sorted its runs (a third of a small shape's time) and called paint_pixel for each pixel; drawImage ran a 16-tap bicubic filter on every pixel of a sprite and read the source canvas back at each call; a shown canvas was read back every frame.
AFTER the patches of ZN-572's first commit (same pairs, two runs): p5 300 shapes 30.2 / 11.0 (2.7 times) ; p5 1,000 ellipses 134.2 / 43.8 (3.1 times) and 164.4 at a speed limit of 37; Phaser CANVAS 76.6 / 16.9 (4.5 times) and 93.1 / 21.1; with pixelArt (nearest pixel) 80.6; Phaser WEBGL 14.7. Of the 43.8 ms of the p5 floor, about 31 are p5 and QuickJS and 13 our facade and path building.

SCORES (RULES 4: fit x3, performance x3, size x2, maintainability x2, licence x2, portability x1, effort x1):
(S) Skia, CPU raster and Ganesh: 5,5,1,2,5,3,1 = 50. Complete and fast; 6 to 20 MB beside a zinc of 13.9 MB, a GN build for each target, 35 to 50 days (the report's figures).
(T) our compositor over ThorVG's coverage: 4,4,4,2,5,5,1 = 52. Small; the 26 formulas, the clip stack, the shadow blur and the sampler are ours, 45 to 60 days.
(K) canvas_ity kept, patched and completed: 4,3,5,3,5,5,5 = 57. Nothing added to the binary, one header we already carry and now patch in six places; what the full tier still lacks (blend modes, patterns as styles, conic gradients, filters) is a formula in its pixel loop or a call it already has (set_pattern).
WHAT WOULD MAKE US REVISIT: a JIT engine (ZN-586) that takes the library's own cost under a few milliseconds, so that the rasteriser becomes the bound; or a demo that must paint a full window with Canvas 2D at 60 frames a second and cannot use WebGL. Then Skia as a module loaded on demand for the desktop (libzn_canvas2d_skia, as libzn_webgl is), never linked into zinc.

NOT PROVEN, and why criterion 1 is not ticked: Skia was not built and the ThorVG route was not prototyped, so there is no size, build time or frame time of either, on this Mac or on a second target (no cross build during the Mac phase, AGENTS.md). Their scores rest on the report (docs/reports/games/js-game-libraries.md) and on the floor above, which bounds what either could gain. p5 2.3 was not measured (tools/test-lib has 1.11.13 only). No number was taken on a quiet machine.
Criterion 2 is the coordinator's (the record in zinc-next-decisions.md). Criterion 3: nothing enters the tree, so no new licence and no new SBOM entry; canvas_ity (ISC) is in third_party/README.md with its pin and its patches, now six; were the decision revisited, Skia is BSD-3-Clause and ThorVG MIT.
The scratch pages of the measure are not in the repository (p5.js is LGPL and stays in the cache of tools/test-lib): a p5 sketch of N shapes and a Phaser bunnymark with a Text, each timing its own frame with performance.now(), run with ZINC_HEADLESS=1 ZINC_WEB=1 ZINC_SIZE=800x600 --engine quickjs.
Review 2026-10-25: dropped. Close as dropped: the spike (Skia vs own compositor over ThorVG) was never run, and the full tier went ahead on canvas_ity (D98) with Chrome-matching SSIM. Nobody needs the comparison now. Revisit only if canvas_ity hits a wall. Evidence: docs/reports/zinc-next-decisions.md D98 (canvas_ity ISC chosen), tests/t1/webenv_canvas2d_full.sh Verifier: Close it, but as decided, not as never-run: D103 (docs/reports/zinc-next-decisions.md:173) records 'full tier stays on canvas_ity, no Skia, no ThorVG' with scores and the deciding measure. AC1 (both routes built) was not done and is moot. D103's revisit condition was a JIT engine (ZN-586): --engine jsc/v8 have now shipped (CHANGELOG.md:224-225), so a later.md line to re-check the Canvas 2D bound on JSC is worth adding.
<!-- SECTION:NOTES:END -->
