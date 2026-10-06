---
id: ZN-072
title: 'Promise statics, Promise as a value, thenable adoption'
status: Backlog
assignee: []
created_date: '2026-10-06 22:50'
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
- [ ] #1 fixtures equal Node's output including ordering of microtasks vs timers
- [ ] #2 examples/remote/viewer and plugins/gphoto2 sim compile past Promise usage
<!-- AC:END -->
