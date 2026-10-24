---
id: ZN-600
title: >-
  Inline caches for named property access in the QuickJS interpreter (patch,
  upstream proposal)
status: Done
assignee: []
created_date: '2026-10-09 09:28'
updated_date: '2026-10-25 01:53'
labels:
  - perf
  - quickjs
  - size-L
milestone: m-21
dependencies:
  - ZN-598
priority: low
ordinal: 5660
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
quickjs-ng merged polymorphic inline caches in 2023 and removed them in February 2025 (1.037x average on the web-tooling benchmark: prettier 1.54x, typescript 0.89x, the bookkeeping costs code that runs once); a monomorphic read IC was closed in May 2026 for flat results. Game and UI frames are the opposite case (hot loops): L1 -> L1.5 in the report's AOT proxy is 1.27x. Only if QJS-06 is a no-go or postponed: add per-site monomorphic caches for get_field, get_field2, put_field and get_var/put_var to the interpreter, guarded by shape and by the atom stored at the cached slot (safe with QuickJS's in-place shape updates), allocated per function only after a warm-up count so run-once code pays nothing; measure on the four workloads and on the web-tooling benchmark; keep as a patch, offer upstream with the numbers. (From docs/reports/quickjs-aot-jit-and-ffi.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 >= 15% on two of the four workloads of the report on the M1 Pro, no workload slower
- [ ] #2 web-tooling benchmark (quickjs-ng's fork) not slower than 0.97x on any test thanks to the warm-up
- [x] #3 test262 subset unchanged; memory per function reported; patch header records the upstream discussion
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-10: measured, NOT adopted (D56, docs/reports/zinc-next-qjs-ic.md). Patch kept as docs/reports/zinc-next-qjs-ic.patch (applies with patch -p1 on third_party/quickjs-ng, build with -DZN_QJS_IC); the tree and the default build are unchanged (build/zinc byte-identical to before).
Design: per-function table after 32 calls/back jumps (about 4 entries of 48 B per site), keyed by site offset; own properties checked by the atom at the cached index (no reference); prototype properties up to 3 deep through referenced hashed shapes (cloned instead of changed in place while referenced); get_var lexicals and global-object properties (global_var_obj shape + size guard); megamorphic cap 16 refills; GC marks the referenced shapes.
AC1 NOT met (Intel Mac, 3 alternated runs, 89-99.9% hits): three.js 0.98-1.00x, sprite 0.97-0.98x, objects 1.01-1.06x, matter-js 0.98-1.02x; the classic one-compare variant is slower (sprite 0.94-0.95x). The criterion named the M1 Pro: follow-up ZN-600.01 remeasures on arm64 in the cross-platform pass.
AC2 not run: the web-tooling gate only guards an adopted cache against run-once code; nothing is adopted.
AC3: test262 regexp 2533/2557 (same failures) and tests/t1/quickjs.sh pass with the caches on; memory 1.6-5 KB per warmed function (three.js 114 KB / 61 functions, matter-js 370 KB / 74); the patch header records upstream's history (removed 2025 at 1.037x, monomorphic read cache closed 2026 flat) and why it is not proposed.
usage: n/a
Review 2026-10-25: the open criteria are moot. Decision made; nothing adopted so AC2 does not apply.
<!-- SECTION:NOTES:END -->
