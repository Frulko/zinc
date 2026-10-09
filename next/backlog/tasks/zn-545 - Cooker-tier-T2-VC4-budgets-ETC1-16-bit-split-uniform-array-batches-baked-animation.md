---
id: ZN-545
title: >-
  Cooker tier T2-VC4: budgets, ETC1, 16-bit split, uniform-array batches, baked
  animation
status: Backlog
assignee: []
created_date: '2026-10-09 07:45'
labels:
  - rpi
  - 3d
  - size-L
milestone: m-25
dependencies:
  - ZN-489
  - ZN-452
  - ZN-439
  - ZN-544
ordinal: 340110
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a T2-VC4 profile to the cooker: per-board budgets (draws, triangles, texture MB, estimated overdraw) checked at cook time; ETC1 with mipmaps (alpha as a second ETC1 or RGBA4444); meshoptimizer vertex cache, overdraw, quantisation and simplified LODs; 16-bit index chunks; instance batches; rigid, flipbook or CPU-skin animation data; visibility cells. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a three.js-authored scene cooks for T2-pi1 and T2-pi3 with a budget report
- [ ] #2 over-budget input fails the cook with a message naming the budget
- [ ] #3 the cooked diorama runs at >= 30 fps at 640x360 upscaled to 720p on the Pi 1 proxy
<!-- AC:END -->
