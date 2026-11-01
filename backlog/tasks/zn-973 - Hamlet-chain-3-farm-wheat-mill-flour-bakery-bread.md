---
id: ZN-973
title: 'Hamlet: chain 3: farm -> wheat -> mill -> flour -> bakery -> bread'
status: Backlog
assignee: []
created_date: '2026-11-01 13:10'
labels:
  - hamlet
  - demo
  - m3
  - economy
  - size-M
milestone: m-30
dependencies:
  - ZN-944
ordinal: 740000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Data plus three models; farms use cleared land (a field footprint of tiles). See docs/reports/hamlet-roadmap-2026-11-01.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 economy.json entries and models for farm, mill, bakery; fields drawn as tile decor
- [ ] #2 Houses of level 2 may eat bread (see housing levels)
- [ ] #3 Chain report shows no orphan resource; scripted run reaches bread
<!-- AC:END -->
