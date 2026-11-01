---
id: ZN-955
title: >-
  Hamlet: static models through the atlas path (buildings, trees, rocks) with
  seasons in the key
status: Backlog
assignee: []
created_date: '2026-11-01 13:03'
labels:
  - hamlet
  - demo
  - m1
  - atlas
  - size-S
milestone: m-30
dependencies:
  - ZN-953
  - ZN-943
ordinal: 700160
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
models.ts bakes 10 models by hand; route them through bakeAtlas so one cache/invalidation path exists, and re-bake on setLighting (season). See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 buildModels() is a bakeAtlas def; model ids unchanged for the callers
- [ ] #2 Changing the lighting invalidates and re-bakes (test: hash differs, models differ)
- [ ] #3 Picture unchanged (pngdiff)
<!-- AC:END -->
