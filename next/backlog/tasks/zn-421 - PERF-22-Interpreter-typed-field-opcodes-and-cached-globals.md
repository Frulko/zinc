---
id: ZN-421
title: 'PERF-22 Interpreter: typed field opcodes and cached globals'
status: Backlog
assignee: []
created_date: '2026-10-09 07:35'
labels:
  - perf
  - size-M
milestone: m-21
dependencies: []
priority: low
ordinal: 5210
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/vm/vm.cpp: L_SetField goes through op::setField (three dependent loads for fieldRef per store), L_GetGlobal through the globals vector, L_Rt through rtCall. Bouncing-ball 200k: interpreter 13.2 ms vs AOT 4.2 ms per frame. Add SetFieldS/SetFieldR chosen by the compiler from the field type, keep the globals data pointer in a loop local, test hostFast in L_Rt.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 bouncing-ball 200k interpreter script -25% (baseline 13.2 ms headless)
- [ ] #2 M4 interpreter kernels no regression; ZBC version check for older device cores
<!-- AC:END -->
