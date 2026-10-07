---
id: ZN-072
title: 'Promise statics, Promise as a value, thenable adoption'
status: Done
assignee: []
created_date: '2026-10-06 22:50'
updated_date: '2026-10-07 01:38'
labels:
  - language
  - async
  - size-M
milestone: m-13
dependencies:
  - ZN-070
  - ZN-067
ordinal: 40140
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Promise.resolve/reject/all/allSettled/race/any/withResolvers, Promise used as a value and a constructor with reject, promise.finally, thenables, unhandled-rejection reporting (extends L-crash), queueMicrotask. Typed generically. Audit 02 RC20 and 01 root cause 3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 fixtures equal Node's output including ordering of microtasks vs timers
- [x] #2 examples/remote/viewer and plugins/gphoto2 sim compile past Promise usage
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Promise.reject/race/any/allSettled/withResolvers, resolve(p) identity, executor reject, T inferred from the wanted type, an untyped Promise.reject is a NeverPromise that converts to any Promise<T>; setTimeout order counts a delay of 0 as 1 (ord) while the clock keeps the frozen reading. Output equals Node's incl. microtasks vs timers. Not done: general thenable adoption (objects with then), async functions returning a promise. gphoto2.sim still stops on another error (line 44, string to boolean) outside Promise.
<!-- SECTION:NOTES:END -->
