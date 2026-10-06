---
id: ZN-156
title: 'Spike: freestanding runtime for PS1'
status: Backlog
assignee: []
created_date: '2026-10-06 23:04'
labels:
  - targets
  - spike
  - size-L
milestone: m-11
dependencies:
  - ZN-121
  - ZN-145
ordinal: 40980
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decision D5. Measure what src/rt needs from libstdc++; try typed AOT output with a small allocator (TLSF) and no exceptions; clang mipsel mips1 soft-float versus PSn00bSDK GCC. Outcome: a verdict with the list of runtime changes, or a recorded decision to keep PS1 on a reduced profile.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a hello and fib PS-EXE run in PCSX-Redux; written verdict and the list of rt changes in docs/reports/zinc-next-ps1.md
<!-- AC:END -->
