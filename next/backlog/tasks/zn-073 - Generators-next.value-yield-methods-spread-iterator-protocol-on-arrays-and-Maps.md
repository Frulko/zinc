---
id: ZN-073
title: >-
  Generators: next().value, yield*, methods, spread, iterator protocol on arrays
  and Maps
status: Backlog
assignee: []
created_date: '2026-10-06 22:50'
labels:
  - language
  - size-M
milestone: m-13
dependencies:
  - ZN-070
ordinal: 40150
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Type next() as IteratorResult<T, R>; add yield* delegation, generator methods (`*name()`), `[...gen]`, Array.from(gen), for-of over any object with [Symbol.iterator], and the same for Map/Set entries(), keys(), values().
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 fixtures equal Node's output for each form
- [ ] #2 audit 01 generator rows pass
<!-- AC:END -->
