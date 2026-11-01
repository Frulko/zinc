---
id: ZN-939
title: 'Hamlet: fixed 1/32 s tick, PRNG in the world state and a state hash'
status: Backlog
assignee: []
created_date: '2026-11-01 12:59'
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
- [ ] #1 stepWorld advances in whole 1/32 s ticks (accumulator in the scene); world.tick counts them
- [ ] #2 The PRNG state lives in World (not a module global) and is part of the snapshot
- [ ] #3 stateHash(world) (FNV-1a over tiles, buildings, people, stocks, rng) exists and is equal after a save/restore round trip
- [ ] #4 Math.hypot and the sin-based hash are replaced in sim and worldgen by sqrt(dx*dx+dy*dy) and an integer hash; no Math.random or Date in world/, rules/, engine/ (a grep check in the test)
- [ ] #5 hamlet.sh prints the same stateHash after 600 ticks on interpreter, AOT and QuickJS
<!-- AC:END -->
