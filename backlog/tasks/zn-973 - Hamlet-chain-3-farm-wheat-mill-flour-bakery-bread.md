---
id: ZN-973
title: 'Hamlet: chain 3: farm -> wheat -> mill -> flour -> bakery -> bread'
status: Backlog
assignee: []
created_date: '2026-11-01 13:10'
updated_date: '2026-11-07 18:30'
labels:
  - hamlet
  - demo
  - m3
  - economy
  - size-M
milestone: m-30
dependencies:
  - ZN-944
ordinal: 18300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-11-07):** Houses of level 2 eat bread; chain report shows no orphan.

Data plus three models; farms use cleared land (a field footprint of tiles). See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 economy.json entries and models for farm, mill, bakery; fields drawn as tile decor
- [ ] #2 Houses of level 2 may eat bread (see housing levels)
- [ ] #3 Chain report shows no orphan resource; scripted run reaches bread
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Farm (no input, 2 wheat / 10 s), mill (2 wheat -> 1 flour), bakery (1 flour -> 2 bread); houses eat smoked meat, bread or fish. Fields as tile decor not drawn (the farm model carries its own wheat rows). AC2 (houses of level 2) waits for housing levels ZN-977: houses simply accept bread now. Orphan check: hide has no consumer until the tannery (ZN-974).

Left open: AC2 (needs ZN-977 housing levels) and AC3 (the orphan report still lists hide until ZN-974 adds the tannery). Next: tests/run --only hamlet after those.
Review 2026-11-07: done-partly. economy.json has farm, mill and bakery (criterion 1 ticked); bread for houses and the orphan report remain.
<!-- SECTION:NOTES:END -->
