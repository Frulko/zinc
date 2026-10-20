---
id: ZN-602
title: AOT Map and Set at native speed (mapset 1.41x)
status: Done
assignee: []
created_date: '2026-10-09 09:48'
updated_date: '2026-10-10 16:14'
labels:
  - perf
  - aot
milestone: m-21
dependencies:
  - ZN-409
priority: medium
ordinal: 371270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split from ZN-409: after typed AOT emission every M4 kernel is within 1.2x of the native toolchain except mapset (15.5 ms vs 11.0 ms) and jsonout (3.3 vs 2.6 ms, startup: ZN-592). mapset is bound by the runtime Map/Set rows (rtCall dispatch, the hash table of src/rt), not by the generated code: profile it and give the hot rows direct entry points or inline fast paths, as ZN-397 did for the host rows.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 mapset AOT <= 1.2x native (tests/bench/kernels, same machine)
- [x] #2 Map/Set goldens and the interpreter unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-10 (usage: n/a, session total).
- Native reference built here with the prototype (node compiler/bin/zinc.mjs build tests/bench/kernels/mapset.ts; empty.ts for the launch): the M1's 1.41x was 2.0x on this Intel Mac. Profile (sample, a 3M-iteration copy): Table::find 66%, rtCall 23%, Table::hash 8%.
- Changes: src/rt/rt.h: mix() inline; Table::find inline for integer and reference keys (bit equality), the key compared before the dead flag and the dead flags skipped while live == keys.size(); findSlow() for floats and strings; putNew() (no second search); op::mapGet / mapHas / mapSet / setAdd, used by rtCall's cases and called directly by compiled code (src/aot/aot.cpp, registers by value, no window). aot.cpp: SetGlobal of a number global is a plain store in untyped functions too (no globalRef test).
- AC1: CPU cycles 41 alternated runs: native 79.1 M, AOT 91.7 M = 1.16x (work only ~1.15); wall 1.13x; was 2.00x. Machine loaded by other agents (load 8-16), hence cycles.
- AC2: same output as the native build; new tests/t1/map_rows.sh (erased keys re-added, NaN / -0 and string keys, chained set, missing keys; output equal to the prototype's sim) passes interpreted and compiled; rt, corpus, corpus_complete, diffmatrix, zbc, ir, aot, aot_size_inline, dyn_function, conformance, jsontestsuite, oracle_diff pass. Interpreter mapset 567.0 -> 535-539 M instructions.
- Dropped after measuring: 16-byte buckets with the key/hash (slower: 52 vs 42 ms), a last-key cache (+5% cycles). Not done: fusing 'm.get(k) ?? d' (has + get, the native build does the same two lookups) into one row: it needs a row appended after the host ones, which the row-range checks (rtCall, isSysRow, usesHost) route to the host.
<!-- SECTION:NOTES:END -->
