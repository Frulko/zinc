---
id: ZN-408
title: PERF-09 String concat and template literals without double copy and rescan
status: Done
assignee: []
created_date: '2026-10-09 07:34'
updated_date: '2026-10-09 09:27'
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
- [x] #1 one allocation and one copy per concatenation
- [ ] #2 jsonout interpreter >= QuickJS speed in tools/bench-m4
- [x] #3 strings goldens unchanged (UTF-16 lengths of non-ASCII cases)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Machine::newStrCat: a + b in one allocation and one copy, ascii = a && b, u16len = a + b (the bytes are appended as they are, so this equals the rescan of newStr); StrConcat and string.concat use it (no std::string, no second copy, no rescan).
AC2 (jsonout interpreter >= QuickJS) is not a concatenation matter: bench-m4 jsonout interpreter 17.0 ms vs QuickJS 8.7 ms, but 'zinc run' of an empty program already takes 12-15 ms (zinc --version 11.2 ms, 88M instructions; qjs 5.1 ms) and jsonout's work is ~2 ms: carried to ZN-592 (launch cost). strings kernel: interpreter 47.4 ms vs QuickJS 61.1 ms.
Tests: t0 run (rt_strings and the non-ASCII goldens identical), zbc, tests/run --changed 45/45.
usage: n/a
<!-- SECTION:NOTES:END -->
