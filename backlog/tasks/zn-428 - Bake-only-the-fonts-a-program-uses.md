---
id: ZN-428
title: Bake only the fonts a program uses
status: Done
assignee: []
created_date: '2026-10-09 07:35'
updated_date: '2026-10-09 10:54'
labels:
  - games
  - assets
  - size-S
  - perf
milestone: m-22
dependencies: []
ordinal: 5003
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Bake the grid-font tables only when the program calls gfx.text. Subset the embedded TrueType files to the scanned characters with hb-subset (already vendored with HarfBuzz; linked into the CLI baker only), unless the project asks for shaped text. Report: docs/reports/games/toolchain-assets-loading.md (1.2, 4.4).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 game-2d resources.bin is at most 0.5 MB (1 706 441 B today)
- [x] #2 tests/t0/res.sh and every pixel golden unchanged
- [x] #3 a program calling gfx.text still draws the grid font
- [x] #4 a "text": "shaped" project keeps whole fonts
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a

Done (D45):
- src/res: the embedded TrueType files are subset with hb-subset (new amalgamation third_party/harfbuzz/src/zn-harfbuzz-subset.cc, library zn_hb_subset linked into zn_res only) to the scanned characters plus U+0020-U+017E and common punctuation; no hinting, no layout tables. A "text": "shaped" project (zinc.json or ZINC_TEXT=shaped) keeps the whole files.
- Grid font 32/48/64 px only when the program's own files call gfx.text (tests/golden/res/main.ts now calls text() with an empty string, so expected.json and frame-2.png stay as they were).
- Library files (zinc:*, lib/std, lib/compat, plugins) count for sizes and characters but not for italic, font-mono and uppercase, which lib/std/ui.ts names as table entries.
- gfx.font returns the exact size: baked, else rasterized from the embedded file, else the closest baked one (src/host/gfx_host.cpp).
- Measured with zinc bake: game-2d 1,706,441 B -> 307 KB; kit-gallery and text 3,576 KB -> 786 KB; hero 7.8 MB -> 1,467 KB; bake time unchanged.

Tests: tests/t0/res.sh, the new tests/t0/res_subset.sh (subset by default, whole files for tests/golden/shaped-ui), T1 ui, text_shaped, svg_lottie and input pass; tests/run --changed 21 passed; T0 83 passed, plus build_inputs_tracked once the new file is committed; proto-capture canary 4 of 4; breakout and bouncing-ball (gfx.text) match the prototype.

What failed on the way: skipping the library's files completely (kit-gallery 209 KB) broke the canary. The runtime rasterizer (runtime/ttf.cpp) and the baker (4x4 supersampling) differ by up to 40 levels on antialiased edges. Before the gfx.font fix, sizes that were not baked fell back to the closest baked size. The regression did not come from earlier commits: a bisection on a worktree at ZN-407, ZN-409, ZN-431 and HEAD gave 4 of 4 at every step.
<!-- SECTION:NOTES:END -->
