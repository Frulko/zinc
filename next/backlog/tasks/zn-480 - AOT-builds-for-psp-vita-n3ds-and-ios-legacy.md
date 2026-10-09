---
id: ZN-480
title: 'AOT builds for psp, vita, n3ds and ios-legacy'
status: Backlog
assignee: []
created_date: '2026-10-09 07:38'
labels:
  - aot
  - handheld
  - handhelds
  - size-L
milestone: m-23
dependencies:
  - ZN-458
  - ZN-459
  - ZN-460
  - ZN-462
ordinal: 300270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc build --aot --target <t>: AOT C++ compiled with the pinned toolchain (-O2 -ffp-contract=off -fno-exceptions -fno-rtti; -march=allegrex -G0 on PSP, -mcpu=cortex-a9 -mfpu=neon on Vita and iOS, -march=armv6k -mtune=mpcore on 3DS) and linked with src/rt and the hosts into the platform package. ZN-145 (4-byte references) stays a later memory optimisation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 fib, the library golden and examples/bouncing-ball give interpreter-identical output in each emulator (iOS on the device)
- [ ] #2 bouncing-ball AOT maximum ball count at 60 fps is at least the interpreter figure on each target
- [ ] #3 binary sizes reported per target
<!-- AC:END -->
