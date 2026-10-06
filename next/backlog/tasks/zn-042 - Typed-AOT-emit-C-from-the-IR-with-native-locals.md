---
id: ZN-042
title: 'Typed AOT: emit C++ from the IR with native locals'
status: Backlog
assignee: []
created_date: '2026-10-06 14:48'
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
- [ ] #3 interpreter, AOT and corpus still agree (T2)
<!-- AC:END -->
