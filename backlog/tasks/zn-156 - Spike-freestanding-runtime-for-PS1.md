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
  - parked
milestone: m-11
dependencies:
  - ZN-121
  - ZN-145
ordinal: 93600
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decision D5. Measure what src/rt needs from libstdc++; try typed AOT output with a small allocator (TLSF) and no exceptions; clang mipsel mips1 soft-float versus PSn00bSDK GCC. Outcome: a verdict with the list of runtime changes, or a recorded decision to keep PS1 on a reduced profile.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a hello and fib PS-EXE run in PCSX-Redux; written verdict and the list of rt changes in docs/reports/zinc-next-ps1.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. PS1 freestanding runtime spike: far from the goal, needs ZN-145 first and PCSX-Redux; the fx12 profile work is done. Keep parked.
Review 2026-10-25: merged ZN-157 here (ps1 target and PCSX-Redux runner). Carry over: Same parked PS1 line as ZN-156: fold the runner criteria (9 programs byte-identical, breakout hash) into ZN-156 and delete this task. ZN-156 (Backlog) is the same parked PS1 line and open. Carry ZN-157's AC (the 9 old ps1 programs byte-identical, breakout screenshot hash) and its description (HAL ps1 reuse, VRAM bands, deterministic frame step, PcsxRedux/OpenBIOS runner) into ZN-156.
<!-- SECTION:NOTES:END -->
