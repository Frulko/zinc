---
id: ZN-145
title: 'AOT: 32-bit references and typed locals for 32-bit targets'
status: Backlog
assignee: []
created_date: '2026-10-06 23:02'
updated_date: '2026-10-08 08:32'
labels:
  - parked
milestone: m-12
dependencies:
  - ZN-144
ordinal: 40870
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Second half of ZN-042's criteria: no 8-byte Slot for typed numeric locals and 4-byte references on 32-bit targets (ESP32, armhf, PS1 spike): value representation per target in include/zn/value.h, the AOT emitting typed locals from the IR. Needed by the PS1 spike.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the AOT output for fib/nbody/sort on armhf-linux under qemu-user uses 4-byte references (checked by object sizes and a memory test)
- [ ] #2 interpreter and AOT outputs equal on the corpus for 32-bit and 64-bit builds
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
parked 2026-10-08: both criteria run armhf programs under qemu-user (Linux only), and the 4-byte value representation touches include/zn/value.h, the AOT emitter and every runtime table; it cannot be verified on this machine. Resume on a Linux host (the wasm32 build already runs the interpreter with 4-byte pointers).
<!-- SECTION:NOTES:END -->
