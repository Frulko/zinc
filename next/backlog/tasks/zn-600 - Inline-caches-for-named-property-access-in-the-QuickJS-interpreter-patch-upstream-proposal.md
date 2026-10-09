---
id: ZN-600
title: >-
  Inline caches for named property access in the QuickJS interpreter (patch,
  upstream proposal)
status: Backlog
assignee: []
created_date: '2026-10-09 09:28'
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
- [ ] #3 test262 subset unchanged; memory per function reported; patch header records the upstream discussion
<!-- AC:END -->
