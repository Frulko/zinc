---
id: ZN-939
title: 'Hamlet: fixed 1/32 s tick, PRNG in the world state and a state hash'
status: Done
assignee: []
created_date: '2026-11-01 12:59'
updated_date: '2026-11-01 14:25'
labels:
  - hamlet
  - demo
  - m1
  - determinism
  - size-S
milestone: m-30
dependencies: []
ordinal: 700000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Determinism base for the data economy, the baked assets and the later multiplayer: the sim steps at a fixed dt, owns its PRNG state, and can hash itself. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 stepWorld advances in whole 1/32 s ticks (accumulator in the scene); world.tick counts them
- [x] #2 The PRNG state lives in World (not a module global) and is part of the snapshot
- [x] #3 stateHash(world) (FNV-1a over tiles, buildings, people, stocks, rng) exists and is equal after a save/restore round trip
- [x] #4 Math.hypot and the sin-based hash are replaced in sim and worldgen by sqrt(dx*dx+dy*dy) and an integer hash; no Math.random or Date in world/, rules/, engine/ (a grep check in the test)
- [x] #5 hamlet.sh prints the same stateHash after 600 ticks on interpreter, AOT and QuickJS
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed 32 Hz tick (scene accumulator), PRNG and tick in World, world/hash.ts stateHash (equal after save/restore; printed by rules.ts and compared across engines in hamlet.sh), integer hash/noise in world/noise.ts, no hypot/pow/sin in sim. Save is H5: the generator changed, so H4 saves are refused cleanly (new village).
<!-- SECTION:NOTES:END -->
