---
id: ZN-048
title: Bake fonts and images in the engine
status: Backlog
assignee: []
created_date: '2026-10-06 16:41'
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
- [ ] #1 an app's fonts and images are baked by zinc build/run with no Node
- [ ] #2 tests/visual/ui.tsx and clock.ts frames stay identical to the goldens, or each difference is documented and the goldens renewed
- [ ] #3 any font size and any asset of examples/ work
<!-- AC:END -->
