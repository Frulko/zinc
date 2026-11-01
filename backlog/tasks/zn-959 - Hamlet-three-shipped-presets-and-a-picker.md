---
id: ZN-959
title: 'Hamlet: three shipped presets and a picker'
status: Backlog
assignee: []
created_date: '2026-11-01 13:05'
labels:
  - hamlet
  - demo
  - m2
  - map
  - presets
  - size-S
milestone: m-30
dependencies:
  - ZN-958
  - ZN-950
ordinal: 700190
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Clearing (today, 12x12), Riverside (32x32, a river and two forests), Highlands (48x48, rocks and deposits). See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Three files load and play (smoke: 600 ticks each, no exception, hash stable on 3 engines)
- [ ] #2 New-village screen lists the presets (keyboard and pointer) with a thumbnail from the overview render
- [ ] #3 Save/load of a user preset from the UI (key F5/F9 or menu) round trips
<!-- AC:END -->
