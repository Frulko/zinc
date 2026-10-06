---
id: ZN-105
title: 'Plugin: canvas2d'
status: Backlog
assignee: []
created_date: '2026-10-06 22:56'
labels:
  - plugins
  - size-S
milestone: m-9
dependencies:
  - ZN-101
ordinal: 40470
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Link plugins/canvas2d natives against the host library's zrt_raster (one runtime owner), stb_image gains JPEG, ZRT_POINT_POOL defines from plugin.json.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 conformance canvas2d.ts passes (all three profile goldens where they exist)
- [ ] #2 examples/canvas/sketch runs headless
<!-- AC:END -->
