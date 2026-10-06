---
id: ZN-092
title: 'JSON and number formatting on yyjson, fast_float and dragonbox'
status: Backlog
assignee: []
created_date: '2026-10-06 22:53'
labels:
  - stdlib
  - performance
  - size-M
milestone: m-13
dependencies:
  - ZN-059
ordinal: 40340
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decision D10: yyjson 0.13 for JSON.parse into Dyn and for stringify, fast_float 8.x for string-to-double, dragonbox 1.1 (shortest round-trip, ECMAScript formatting rules) for double-to-string (replaces printf-based number printing in include/zn/ops and rtcalls). Measure before and after (bench/json), keep the strict JSON error messages of the prototype where tests rely on them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 JSONTestSuite results: all y_ accepted, all n_ rejected, i_ behaviour documented
- [ ] #2 number printing equals Node on 1e6 random doubles and edge cases (checked offline with a generated table kept in tests/data)
- [ ] #3 jsonout benchmark improves or stays equal; binary size delta recorded
<!-- AC:END -->
