---
id: ZN-955
title: >-
  Hamlet: static models through the atlas path (buildings, trees, rocks) with
  seasons in the key
status: Done
assignee: []
created_date: '2026-11-01 13:03'
updated_date: '2026-11-01 14:33'
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
- [x] #1 buildModels() is a bakeAtlas def; model ids unchanged for the callers
- [x] #2 Changing the lighting invalidates and re-bakes (test: hash differs, models differ)
- [x] #3 Picture unchanged (pngdiff)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done. models.ts keeps its API (models[], MODEL_* ids, useModels, resetModels); the models are a MODEL_DEFS table baked through bakeAtlas, one atlas per art level, re-baked when its header goes stale (lighting, size, scale, resample). Test: another light re-bakes and the first light returns the same models. Picture: deterministic frame 320 of the scripted session, old vs new models, pngdiff tolerance 0: 0 differing pixels.
<!-- SECTION:NOTES:END -->
