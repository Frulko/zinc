---
id: ZN-042
title: 'Typed AOT: emit C++ from the IR with native locals'
status: Review
assignee: []
created_date: '2026-10-06 14:48'
updated_date: '2026-10-06 20:19'
labels: []
dependencies: []
priority: medium
ordinal: 33200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
AOT from ZBC keeps registers in 8-byte Slots (1.2x to 3x native on numeric kernels). For constrained targets (ESP32, RPi1, PS1, PS2) emit typed C++ straight from the SSA IR (int32_t, double, 4-byte references on 32-bit), keeping the IR the single source of truth.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 AOT within 1.3x of native on fib, nbody, sort, spectralnorm in tools/bench-m4
- [ ] #2 no 8-byte Slot in generated code for typed numeric locals; 32-bit targets use 4-byte references
- [x] #3 interpreter, AOT and corpus still agree (T2)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. No typed backend: hand-typed nbody showed no gain (the native build wins by NEON vectors and FMA, which the determinism rule excludes). Done instead: AOT links SDL only for programs that draw (-4 ms startup), arr.sort((a,b)=>a-b) specialised (sort 2.68x to 1.15x), fib 1.93x to 1.42x; nbody stays 2.88x. AC1 and AC2 open; see docs/reports/zinc-next-perf.md. Decision needed: a fast-math AOT profile or accept nbody.
<!-- SECTION:NOTES:END -->
