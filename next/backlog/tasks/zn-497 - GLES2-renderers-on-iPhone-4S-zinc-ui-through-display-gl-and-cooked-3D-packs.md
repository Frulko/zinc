---
id: ZN-497
title: 'GLES2 renderers on iPhone 4S: zinc:ui through display-gl and cooked 3D packs'
status: Backlog
assignee: []
created_date: '2026-10-09 07:39'
labels:
  - handheld
  - pocketjs
milestone: m-23
dependencies:
  - ZN-490
  - ZN-462
ordinal: 300440
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reuse plugins/display-gl's GLSL ES 1.00 UI renderer on iOS, and add a GLES2 3D path for the ios60 pack layout: VBO/IBO, attributes on 4-byte boundaries, lowp colours, RGB565 textures, 4x MSAA with the APPLE resolve, discard of depth after the frame. The same renderer builds on macOS through SDL3 + GLES2 as the oracle, since no emulator exists. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The desktop GLES2 build and the device produce matching captures of pocket-hero within mean RGB <= 8
- [ ] #2 The sample pack renders on the device within tolerance of the pack viewer
- [ ] #3 Hardware receipt: pocket-hero at 60 fps with CPU time per frame recorded
<!-- AC:END -->
