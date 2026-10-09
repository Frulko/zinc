---
id: ZN-490
title: 'Pack viewer on desktop: reference renderer for cooked packs'
status: Backlog
assignee: []
created_date: '2026-10-09 07:39'
labels:
  - handheld
  - pocketjs
milestone: m-23
dependencies:
  - ZN-489
  - ZN-452
ordinal: 300370
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A desktop Zinc tool that draws any cooked pack (psp30, n3ds30, ios60, vita60) with Zinc's GL path, decoding each target's vertex and texture layouts, so cook errors are seen before a device or emulator is involved, like Pocket3D's browser player. Fly a fixed route and capture frames; compare with the source scene rendered by three.js on Zinc. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc run tools/packview <pack> displays each of the four profiles of the sample scene
- [ ] #2 Captures at three route marks reach SSIM >= 0.9 against the three.js source render
- [ ] #3 A T1 test renders one pack headless and checks a golden
<!-- AC:END -->
