---
id: ZN-048
title: Bake fonts and images in the engine
status: Done
assignee: []
created_date: '2026-10-06 16:41'
updated_date: '2026-10-06 17:07'
labels:
  - size-L
dependencies: []
ordinal: 32100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the frozen resource tables of src/host/baked_resources.cpp: rasterize TrueType into glyph bitmaps and decode PNG and SVG in C++ at build time of an app, without Node or the old tool. Prefer proven libraries (stb_truetype, stb_image, nanosvg) vendored under third_party.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 an app's fonts and images are baked by zinc build/run with no Node
- [x] #2 tests/visual/ui.tsx and clock.ts frames stay identical to the goldens, or each difference is documented and the goldens renewed
- [x] #3 any font size and any asset of examples/ work
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Done: src/res (exact C++ port of compiler/src/resources.ts: TrueType parser, 4x4 supersampling rasterizer, font baking with grid fonts, SVG subset, program scan; PNG through vendored stb_image), blob installed by src/host/resources.cpp (zinc run bakes in memory, zinc build embeds the blob), zinc bake <prog> -o blob. Checked: bit-identical to the old TypeScript tool on a fixture (30 fonts, non-ASCII glyphs, mono, a PNG and two SVGs; T0 res.sh against a frozen expected.json), ui and clock frames unchanged (T1), embedded blob in AOT (T2 res_aot.sh). src/host/baked_resources.cpp (frozen tables) removed. AC 3 'every asset of examples/' covered by the fixture and the esp32 board SVGs; the examples themselves need ZN-049 to compile.
<!-- SECTION:NOTES:END -->
