---
id: ZN-073
title: >-
  Generators: next().value, yield*, methods, spread, iterator protocol on arrays
  and Maps
status: Done
assignee: []
created_date: '2026-10-06 22:50'
updated_date: '2026-10-07 01:50'
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
- [x] #1 fixtures equal Node's output for each form
- [x] #2 audit 01 generator rows pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. next() returns IteratorResult<T> (step() is the internal boolean), yield* on generators (while step()), generator methods *name(), [Symbol.iterator]() for for-of, spread of generator/Set/Map/string, Array.from (iterable, mapper, {length}), entries/keys/values of Map, Set and Array as arrays; an exhausted generator releases its loops (no leak). Fixture equals Node. Limits: yield* of arrays, early exit of for-of does not run finally.
<!-- SECTION:NOTES:END -->
