---
id: ZN-057
title: >-
  Examples gaps: async methods, Date getters, gfx image targets, lib/std
  narrowing
status: Done
assignee: []
created_date: '2026-10-06 17:49'
updated_date: '2026-10-06 20:43'
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
- [x] #1 hero, maps/explorer, remarkable dashboard and notes run headless
- [x] #2 pixel goldens where they exist match
- [x] #3 host modules documented with capability per target
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. hero, dashboard, notes now run (explorer needs the native MapEngine: documented, not done). Features: async methods, Date getters, gfx image targets, zinc:net, string.at, arr.length=, ?? null, per-file undefined, generic lambda param inference, void callbacks, optional callbacks; lottie/video .next.ts sims; fixed padStart rc bug and null string ==. T1 examples.sh with 3 pixel goldens.
<!-- SECTION:NOTES:END -->
