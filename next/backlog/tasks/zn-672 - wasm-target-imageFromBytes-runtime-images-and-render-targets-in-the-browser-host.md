---
id: ZN-672
title: >-
  wasm target: imageFromBytes, runtime images and render targets in the browser
  host
status: Backlog
assignee: []
created_date: '2026-10-10 19:20'
labels:
  - wasm
  - gfx
  - size-M
dependencies: []
ordinal: 428410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Follow-up of ZN-432, D73.) In the browser host imageFromBytes answers -1 with a warning, and runtime images and render targets do not draw; readBytes of exported assets is needed too (or depend on ZN-449).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tests/data/image_rect/main.ts passes check.py in headless Chrome
- [ ] #2 a render target shows in the page
- [ ] #3 readBytes reads an exported asset
<!-- AC:END -->
