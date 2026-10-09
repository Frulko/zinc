---
id: ZN-408
title: PERF-09 String concat and template literals without double copy and rescan
status: Backlog
assignee: []
created_date: '2026-10-09 07:34'
labels:
  - perf
  - size-S
milestone: m-21
dependencies: []
priority: low
ordinal: 5080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/rt/rtcalls.cpp:933 StrConcat builds a std::string then newStr (machine.cpp:265) copies again and rescans every byte for ascii and UTF-16 length. Allocate the StrObj once at the summed length, ascii = a && b, u16len = sum; a builder for StrConcatM. jsonout: interpreter 16.0 ms vs QuickJS 9.0 ms (published LOSS).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 one allocation and one copy per concatenation
- [ ] #2 jsonout interpreter >= QuickJS speed in tools/bench-m4
- [ ] #3 strings goldens unchanged (UTF-16 lengths of non-ASCII cases)
<!-- AC:END -->
