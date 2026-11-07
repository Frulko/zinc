---
id: ZN-958
title: 'Hamlet: map preset format, loader and writer'
status: Backlog
assignee: []
created_date: '2026-11-01 13:05'
labels:
  - hamlet
  - demo
  - m2
  - map
  - presets
  - size-M
milestone: m-30
dependencies:
  - ZN-947
  - ZN-946
ordinal: 720000
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A preset is one JSON file: version, name, size w,h, seed, terrain (row strings), objects (tree, rock, deposit, deer spawn), gate, start stocks, buildings and roads (optional, for a scenario), goals. Same encoding as the save's town block. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Format documented in the roadmap and validated by loadPreset(text) with named errors (T0)
- [ ] #2 savePreset(world) writes a preset from the current village; loadPreset then generate-free restores it; stateHash equal (round trip)
- [ ] #3 A preset can be 'seeded' (generator params only, tiny) or 'baked' (explicit tiles)
- [ ] #4 Presets live in examples/hamlet/presets/*.json and user presets in the app data directory
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: dropped. Presets exist as generator parameters (src/gen/presets.ts) plus missions (world/missions.ts); a baked JSON map format has no user now.
<!-- SECTION:NOTES:END -->
