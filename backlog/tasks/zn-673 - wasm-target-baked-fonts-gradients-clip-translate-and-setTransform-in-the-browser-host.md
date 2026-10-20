---
id: ZN-673
title: >-
  wasm target: baked fonts, gradients, clip, translate and setTransform in the
  browser host
status: Backlog
assignee: []
created_date: '2026-10-10 19:20'
labels:
  - wasm
  - gfx
  - size-M
dependencies: []
ordinal: 429410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Follow-up of ZN-432, D73.) The browser host draws text with the browser's fonts and warns on gradients, clip, translate and setTransform.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the title scene of game-2d in Chrome is within the pixel-compare tolerance of the native frame
- [ ] #2 textWidth equals the native value
- [ ] #3 tests/data/image_rect/xform.ts passes in Chrome
<!-- AC:END -->
