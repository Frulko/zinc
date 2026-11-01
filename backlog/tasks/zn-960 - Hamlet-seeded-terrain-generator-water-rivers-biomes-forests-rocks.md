---
id: ZN-960
title: 'Hamlet: seeded terrain generator: water, rivers, biomes, forests, rocks'
status: Backlog
assignee: []
created_date: '2026-11-01 13:05'
labels:
  - hamlet
  - demo
  - m2
  - map
  - procedural
  - reuse
  - size-M
milestone: m-30
dependencies:
  - ZN-951
  - ZN-947
ordinal: 720010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reusable worldgen taking (seed, w, h, params) and returning layers (height-free tile classes, water, wetness, forest density, rocks). Built from the current generate() and the harbor/river scenery logic; no hamlet types inside so other games can use it. Integer hash only. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 gen.terrain(seed,w,h,params) returns typed layers; same seed gives the same output on the 3 engines (hash test)
- [ ] #2 Params: water_amount, river (bool), forest_density, rock_density, biome (meadow, pine, birch mix)
- [ ] #3 Hamlet generate() uses it; seed 1 12x12 stays playable (gate area clear, pond reachable)
- [ ] #4 Lives in pixel-plays/native/gen/ (promoted later with the shared module)
<!-- AC:END -->
