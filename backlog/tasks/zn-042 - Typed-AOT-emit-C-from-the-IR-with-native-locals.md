---
id: ZN-042
title: 'Typed AOT: emit C++ from the IR with native locals'
status: Done
assignee: []
created_date: '2026-10-06 14:48'
updated_date: '2026-10-06 23:06'
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
Closed on 2026-10-07 under RULES.md: what remains became tasks of the parity backlog (ZN-042: H-typed-abi, C-typed-abi; ZN-053: H-updater, R-sdl-static; ZN-030: validated on Espressif QEMU and device-sim, real board parked as ZN-055).
<!-- SECTION:NOTES:END -->
