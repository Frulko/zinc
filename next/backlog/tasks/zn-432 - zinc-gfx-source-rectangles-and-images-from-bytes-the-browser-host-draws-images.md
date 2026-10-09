---
id: ZN-432
title: >-
  zinc:gfx source rectangles and images from bytes; the browser host draws
  images
status: Backlog
assignee: []
created_date: '2026-10-09 07:35'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies: []
ordinal: 200000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add rows drawImageRect(img, sx, sy, sw, sh, dx, dy, dw, dh, alpha, flags) (flip; nearest or linear) and imageFromBytes. Implement them in the software rasterizer, display-gl and the wasm host; the wasm host also draws baked images and fonts. Report: docs/reports/games/toolchain-assets-loading.md (1.1, 4.3).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc:canvas 9-argument drawImage uses the row and pixel goldens are unchanged
- [ ] #2 a sprite-sheet frame is equal in the interpreter, AOT and headless Chrome
- [ ] #3 game-2d's sprites show in the wasm export
<!-- AC:END -->
