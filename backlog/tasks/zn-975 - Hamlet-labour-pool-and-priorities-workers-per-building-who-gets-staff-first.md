---
id: ZN-975
title: 'Hamlet: labour pool and priorities: workers per building, who gets staff first'
status: Done
assignee: []
created_date: '2026-11-01 13:11'
updated_date: '2026-11-01 14:50'
labels:
  - hamlet
  - demo
  - m3
  - economy
  - size-S
milestone: m-30
dependencies:
  - ZN-942
  - ZN-956
ordinal: 740020
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Idea from Caesar III: fixed job count per building, a priority order the player can change. Without staff a building produces nothing and spawns no walkers. See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Building def workers + a priority list (sawmill, lodge...) editable with keys
- [x] #2 Shortage shown by hints (no_workers)
- [x] #3 Test: 3 buildings, 3 workers, priority respected
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered: rules/labour.ts (world.priority, movePriority, rankOf, priorityLabels) and assignJobs hands idle residents out in that order; hint no_workers (rules/hints.ts) when a workplace lacks hands and nobody is idle; save H8 stores the order. The key binding itself belongs to the UI (HamletScene/hud, other agent): it calls movePriority(type, -1|1). Test: tests/data/hamlet/rules.ts labour block (3 hands, 3 workplaces, both orders).
<!-- SECTION:NOTES:END -->
