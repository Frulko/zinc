---
id: ZN-604
title: 'AOT program diet, part 2: hero under 8 MB and 30 s'
status: Backlog
assignee: []
created_date: '2026-10-09 10:22'
labels:
  - perf
  - aot
milestone: m-21
dependencies:
  - ZN-603
  - ZN-428
priority: medium
ordinal: 5004
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split from ZN-603. hero now: 16.0 MB binary, 48 s build, 16.6 MB of C++ (module 184 KB packed, functions 16.0 MB). Where the 16 MB are: about 8 MB of baked fonts and images in __const (ZN-428 bakes only the fonts a program uses), 4.3 MB of hero's own machine code (1678 functions), about 5 MB of runtime and libraries (bouncing-ball's AOT is 5.0 MB; SDL3 as a module is ZN-330.03). The generated C++ is dominated by inline null checks (4 MB of 'op::kNullRef' text), release calls with their own error test (2.5 MB) and window copies around calls; one translation unit (ZN-427).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 hero AOT binary <= 8 MB and zinc build <= 30 s (macOS arm64, -j3)
- [ ] #2 generated C++ of hero <= 10 MB
- [ ] #3 interpreter and AOT frames identical on hero, nuxt-ui, rn-showcase
<!-- AC:END -->
