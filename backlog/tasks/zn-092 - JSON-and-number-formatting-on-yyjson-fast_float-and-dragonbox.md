---
id: ZN-092
title: 'JSON and number formatting on yyjson, fast_float and dragonbox'
status: Done
assignee: []
created_date: '2026-10-06 22:53'
updated_date: '2026-10-07 05:54'
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
- [x] #1 JSONTestSuite results: all y_ accepted, all n_ rejected, i_ behaviour documented
- [x] #2 number printing equals Node on 1e6 random doubles and edge cases (checked offline with a generated table kept in tests/data)
- [x] #3 jsonout benchmark improves or stays equal; binary size delta recorded
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Measure first: the in-tree parser already passes JSONTestSuite (95 y_ accepted, 188 n_ rejected, 35 i_ equal to Node: tests/t1/jsontestsuite.sh, tests/data/jsontestsuite.tar.xz + .expected + .md) and std::to_chars prints doubles like Node (tests/golden/run/number_print.ts: edge cases + hash of 1e6 doubles m*2^e, identical to Node). Decision D19 (docs/reports/zinc-next-decisions.md): keep them, no yyjson/fast_float/dragonbox in the runtime. Real fixes: JSON.stringify of a Dyn tree is a runtime call (Rt JsonOut, native walker, falls back to the Zinc code for typed object views): bench/json.ts parse+stringify x10 1373 -> 227 ms (QuickJS 690 ms), no binary size change; nesting limit 400 -> 1000 (Node accepts i_structure_500_nested_arrays). Found on the way: an integer literal adopted the kind of the other operand even when it did not fit (u32 * 4294967296 wrapped to 0): arith() now keeps the double when the literal does not fit (tests/golden/run/literal_kind_fit.ts). Not done: typed JSON.stringify (generated Zinc per type) is still interpreted; yyjson stays in the frontend for plugin.json/zinc.json.
<!-- SECTION:NOTES:END -->
