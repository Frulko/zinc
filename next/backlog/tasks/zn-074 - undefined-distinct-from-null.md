---
id: ZN-074
title: undefined distinct from null
status: Backlog
assignee: []
created_date: '2026-10-06 22:50'
labels:
  - language
  - runtime
  - size-M
milestone: m-13
dependencies:
  - ZN-065
ordinal: 40160
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today `undefined` is null in files that do not use Dyn, so typeof, console.log, `?.`, templates, JSON.stringify of optional fields print null. Give undefined its own tag in Dyn and for optional fields/parameters/missing Map.get, print 'undefined' where JavaScript does, make String(null) legal, keep the fast path (non-nullable types) unchanged. Record the representation decision (a sentinel object vs a second null) with measurements.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 fixtures equal Node's output for typeof/console.log/templates/JSON of undefined and null in optional fields, parameters and Map.get
- [ ] #2 no regression above 3% on bench-m4
<!-- AC:END -->
