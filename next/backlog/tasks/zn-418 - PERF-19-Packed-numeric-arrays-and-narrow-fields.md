---
id: ZN-418
title: PERF-19 Packed numeric arrays and narrow fields
status: Backlog
assignee: []
created_date: '2026-10-09 07:34'
labels:
  - perf
  - size-L
milestone: m-21
dependencies:
  - ZN-409
  - ZN-145
priority: medium
ordinal: 5180
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
rt.h ArrObj stores every element as an 8-byte Slot (u8[] is 8x its size) and every field is a Slot (a Ball is 64 bytes). Store numeric elements and struct fields at their type size (typed views in AOT, size switch in the interpreter). Memory and bandwidth 2-8x on numeric data; required for PSP-class memory.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 u8[]/i32[]/f32[] elements at their size; object fields at their size in the PERF-10 structs
- [ ] #2 interpreter and AOT outputs identical; natives, JSON and sort tests pass
- [ ] #3 memory of a 1 M-element u8[] <= 1.1 MB
<!-- AC:END -->
