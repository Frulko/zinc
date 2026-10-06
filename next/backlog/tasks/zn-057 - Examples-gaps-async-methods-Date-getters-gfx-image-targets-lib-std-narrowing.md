---
id: ZN-057
title: >-
  Examples gaps: async methods, Date getters, gfx image targets, lib/std
  narrowing
status: Backlog
assignee: []
created_date: '2026-10-06 17:49'
labels:
  - size-L
dependencies: []
ordinal: 34300
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remaining blockers of ZN-049: async class methods (plugins/map), Date getHours/getMinutes etc., zinc:gfx createImage/destroyImage/beginImage/endImage (plugins/ink), 'string|null' operators and null|callback to Dyn in lib/std ui/solid/kit (hero). Goal: hero, maps/explorer, remarkable dashboard/notes run headless.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 hero, maps/explorer, remarkable dashboard and notes run headless
- [ ] #2 pixel goldens where they exist match
- [ ] #3 host modules documented with capability per target
<!-- AC:END -->
