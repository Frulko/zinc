---
id: ZN-960
title: 'Hamlet: seeded terrain generator: water, rivers, biomes, forests, rocks'
status: Done
assignee: []
created_date: '2026-11-01 13:05'
updated_date: '2026-11-01 15:06'
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
- [x] #1 gen.terrain(seed,w,h,params) returns typed layers; same seed gives the same output on the 3 engines (hash test)
- [x] #2 Params: water_amount, river (bool), forest_density, rock_density, biome (meadow, pine, birch mix)
- [x] #3 Hamlet generate() uses it; seed 1 12x12 stays playable (gate area clear, pond reachable)
- [x] #4 Lives in pixel-plays/native/gen/ (promoted later with the shared module)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered: examples/hamlet/src/gen/terrain.ts (terrain(seed,w,h,params) -> layers outside/water/wet/forest/rock/deco + pond blob; params waterAmount, river, forestDensity, rockDensity, biome mixed/pine/birch/meadow; integer hash+noise, no game types) and world.generate() built on it with the default params reproducing the old village exactly. Decision: the folder is examples/hamlet/src/gen/, not pixel-plays/native/gen/ (examples/pixel-plays is not committed yet and belongs to another session); moving it is a rename when the shared module is promoted. Params are saved (H11). Test: rules.ts terrain block with a printed genhash compared across the three engines by tests/t1/hamlet.sh.
<!-- SECTION:NOTES:END -->
