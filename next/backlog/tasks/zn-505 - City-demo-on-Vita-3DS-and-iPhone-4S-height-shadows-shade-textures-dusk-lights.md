---
id: ZN-505
title: >-
  City demo on Vita, 3DS and iPhone 4S: height shadows, shade textures, dusk
  lights
status: Backlog
assignee: []
created_date: '2026-10-09 07:40'
labels:
  - handheld
  - pocketjs
milestone: m-23
dependencies:
  - ZN-494
  - ZN-496
  - ZN-498
  - ZN-504
ordinal: 300520
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Vita: 16-bit height texture compared per fragment, normals with dot(N, sun), night facades with per-building late bits, bloom on the previous frame at quarter resolution, traffic ring buffer; 3DS: L8 shade texture multiplied in a TEV stage, lamp texture, 17 sector lights selected in the vertex program, fog LUT; iPhone 4S: GLES2 programs implementing the 3DS math with a luminance shadow texture uploaded in strips. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Hardware receipts: Vita 60 fps 0 late, 3DS 30 fps 0 late, iPhone 4S 60 fps < 0.5 % late over the tour
- [ ] #2 Emulator goldens where available
- [ ] #3 The same city IR and TS program drive the three renderers
<!-- AC:END -->
