---
id: ZN-598
title: >-
  QuickJS hot-function profile: opcode histogram and per-function counts in zinc
  profile
status: Backlog
assignee: []
created_date: '2026-10-09 09:28'
labels:
  - perf
  - quickjs
  - tools
  - size-M
milestone: m-21
dependencies:
  - ZN-595
priority: medium
ordinal: 5640
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The report's analysis needed a patched build to see where QuickJS time goes (85-97% of samples land in JS_CallInternal, so function-level sampling says nothing). Add a profiling build option of the patched engine: dynamic opcode histogram, per-bytecode-function call counts and backward-jump counts, and a sampled 'current JS function' so `zinc profile --engine quickjs` lists the hottest JS functions with file:line. This selects the functions for accelerators (QJS-04) and for AOT (QJS-06). (From docs/reports/quickjs-aot-jit-and-ffi.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc profile on a QuickJS program prints the top 30 JS functions by samples with file:line, and the opcode mix
- [ ] #2 off by default; zero cost in normal builds (checked by the boundary micro-benchmark)
- [ ] #3 documented in docs/ with the four workloads of the report as examples
<!-- AC:END -->
