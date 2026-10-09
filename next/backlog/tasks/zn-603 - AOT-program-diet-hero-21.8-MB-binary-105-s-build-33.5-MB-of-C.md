---
id: ZN-603
title: 'AOT program diet: hero 21.8 MB binary, 105 s build, 33.5 MB of C++'
status: Backlog
assignee: []
created_date: '2026-10-09 09:48'
labels:
  - perf
  - aot
milestone: m-21
dependencies:
  - ZN-431
priority: high
ordinal: 5002
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-09: 'how can it be so heavy?'. Measured on examples/hero: 21.8 MB binary (20.3 MB __TEXT), 105 s for zinc build, 33.5 MB of generated C++. Causes: (1) 2775 functions compiled, the whole zinc:ui and kit libraries: no unreachable-function removal (ZN-431); (2) the whole 3.25 MB ZBC module embedded (11.5 MB of decimal text) although every function is compiled: the program needs only the class, string, constant and global tables, and decoding and verifying it costs at every launch (ZN-592); (3) about 8 KB of C++ per function: every instruction carries its own error path with an inline message (shared trap labels per function would cut it); (4) one translation unit at -O2 (ZN-427).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 hero AOT binary <= 8 MB and zinc build of hero <= 30 s (macOS arm64, -j3)
- [ ] #2 the embedded module has no code words for functions that are compiled (tables only); interpreter and AOT frames identical
- [ ] #3 generated C++ of hero <= 10 MB
<!-- AC:END -->
