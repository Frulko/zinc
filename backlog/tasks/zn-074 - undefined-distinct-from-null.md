---
id: ZN-074
title: undefined distinct from null
status: Done
assignee: []
created_date: '2026-10-06 22:50'
updated_date: '2026-10-07 02:05'
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
- [x] #1 fixtures equal Node's output for typeof/console.log/templates/JSON of undefined and null in optional fields, parameters and Map.get
- [x] #2 no regression above 3% on bench-m4
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. D18: same representation, the distinction is the static flavour of the union (Type.undef); printing, templates, typeof, String(), JSON omit follow it. bench-m4 vs the committed numbers: every kernel within +-3% except noise (interp fannkuch -4.8%, binarytrees -5.3% faster); the exit code 1 of --check-regressions is the two existing LOSS rows (jsonout, dynsum vs QuickJS), unchanged.
<!-- SECTION:NOTES:END -->
