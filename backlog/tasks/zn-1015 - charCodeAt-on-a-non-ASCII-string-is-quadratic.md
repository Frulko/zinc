---
id: ZN-1015
title: charCodeAt on a non-ASCII string is quadratic
status: Backlog
assignee: []
created_date: '2026-11-07 16:35'
labels:
  - perf
  - runtime
  - size-S
milestone: m-21
dependencies: []
ordinal: 1008000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Each `charCodeAt(i)` (and the other UTF-16 index reads) on a non-ASCII string converts the whole string with `toU16`: a loop over 90 KB of accented text took 19 s in JSON.stringify. Cache the UTF-16 form on the string (or index lazily).

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-844: `charCodeAt(i)` (and the other UTF-16 index reads) on a non-ASCII string converts the whole string with `toU16` at each call (src/rt/rtcalls.cpp), so a charCodeAt loop over accented text is quadratic: 90 KB took 19 s in JSON.stringify before it got a native quote. Keep a UTF-16 view or a byte cursor per string.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a `charCodeAt` loop over 1 MB of accented text runs linearly (under 100 ms)
- [ ] #2 results identical on all engines; bench-gate shows no regression on ASCII
<!-- AC:END -->
