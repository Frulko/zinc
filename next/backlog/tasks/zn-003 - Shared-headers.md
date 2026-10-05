---
id: ZN-003
title: Shared headers
status: Done
assignee: []
created_date: '2026-10-05 14:21'
updated_date: '2026-10-05 15:20'
labels:
  - size-S
milestone: m-0
dependencies:
  - ZN-002
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As a **Maintainer**, I want opcodes, value layouts, limits and ABI constants defined once in `include/zn/`, so that the compiler and VM cannot diverge (recursion limit defined once, unlike today's 1024 vs 16383).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a stub compiler and a stub VM include the same header; one test fails if either redefines a constant.
- [x] #2 M0 demo: next/tests/run --tier t1 on the frozen corpus with the stub binary prints only totals
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
include/zn/{limits,opcodes,value}.h define constants once; stub zbc and vm libs include them; T0 shared_headers fails if src/ defines constexpr or ZN_ macros (verified by injecting one); T1 corpus_complete is the M0 demo. kMaxCallDepth=1024 is a placeholder (old tree: VM 1024, compiler 16383), decide in ZN-010. usage: 76593 in / 4198168 cached / 31128 out tokens, 55 turns (session total, estimate)
<!-- SECTION:NOTES:END -->
