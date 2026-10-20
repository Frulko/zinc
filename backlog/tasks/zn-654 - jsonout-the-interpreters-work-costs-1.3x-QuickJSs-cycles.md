---
id: ZN-654
title: 'jsonout: the interpreter''s work costs 1.3x QuickJS''s cycles'
status: Done
assignee: []
created_date: '2026-10-10 17:57'
updated_date: '2026-10-10 18:08'
labels:
  - perf
  - interp
  - size-M
milestone: m-21
dependencies: []
ordinal: 400410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tools/bench-m4 now judges jsonout on its work (ZN-648: each engine's cycles for the kernel minus its cycles for an empty program, /usr/bin/time -l, in alternation): interpreter ~5.5M cycles, compiled ~3.9-4.6M, QuickJS ~4.3M on the Intel Mac (machine at load 8; two runs agreed). The kernel builds 500 small objects ('item-' + i.toString(), i * 0.5) and JSON.stringify's them once. Profile the interpreter on it (zinc profile, or a loop of 100 stringify calls to get a measurable run), find what costs (number formatting, string building, the stringify walk through the class fields) and bring the work under QuickJS's.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 tools/bench-m4: jsonout's interpreter work not slower than QuickJS's (short kernel threshold), on a quiet Intel Mac
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-10. (1) Rt::NumToStrI/U: std::to_chars instead of snprintf (snprintf's format parsing was 4% of a profile of 3000 iterations of jsonout's body). (2) src/frontend/inspect.cpp: the generated serialiser of an object whose fields are all written is one concatenation ('{"id":' + __jsN(v.id) + ',"name":' + ...) instead of an array, a push per field and a join; objects with optional fields keep the array. Same text: corpus, zbc, conformance (7 programs use JSON.stringify), corpus_complete, jsontestsuite, aot PASS; jsonout interpreted and compiled print corpus/bench/jsonout.out.
Measured (Intel Mac, load 6-9): 200 iterations 662M -> 631M -> 538M cycles (QuickJS 701-743M); one run, best of 30: interpreter work 4.79M -> 3.51M cycles vs QuickJS 4.00M. bench-m4 judged it by medians of cycles first: 0.82-1.47x across three runs at load 8, so tools/bench-m4 now takes the fastest run of each alternated series (D69 updated): 1.00x, 1.16x, 1.12x: pass.
usage: n/a
<!-- SECTION:NOTES:END -->
