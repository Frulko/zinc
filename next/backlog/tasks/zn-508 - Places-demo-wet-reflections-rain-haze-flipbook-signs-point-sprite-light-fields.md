---
id: ZN-508
title: >-
  Places demo: wet reflections, rain, haze, flipbook signs, point-sprite light
  fields
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
ordinal: 300550
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An Atlas-class demo with two places first (a rainy night street and a dusk vista): planar wet reflection (stencil mask and mirrored pass on GE, reflection target with TEV interpolate on PICA, reflection pass on GXM), rain streaks, haze, flipbook signs from material annotations, light fields as GXM point sprites, PICA vertex-expanded sprites and GE bone-weighted sprite groups, Vita post chain (4x MSAA, bloom, haze, LUT grade) with a resolution governor. Target 30 fps. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Hardware receipts at 30 fps for both places on Vita and 3DS, and recorded rates on PSP and iPhone 4S
- [ ] #2 The scene annotations (wet, sign, lights) are read by the cooker from glTF extras
- [ ] #3 Emulator goldens for each place where an emulator exists
<!-- AC:END -->
