---
id: ZN-480
title: 'AOT builds for the PSP, Vita, 3DS and PS2 cores'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-09 07:38'
labels:
  - aot
  - handheld
  - handhelds
  - size-L
milestone: m-23
dependencies:
  - ZN-458
  - ZN-462
ordinal: 53800
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** zinc build --aot --target psp|vita|n3ds|ps2 with the pinned toolchains (flags as in the task), linked with the console cores; ios-legacy removed. Criteria: fib, library golden and bouncing-ball match the interpreter in each emulator; ball count at least the interpreter; sizes per target.

zinc build --aot --target <t>: AOT C++ compiled with the pinned toolchain (-O2 -ffp-contract=off -fno-exceptions -fno-rtti; -march=allegrex -G0 on PSP, -mcpu=cortex-a9 -mfpu=neon on Vita and iOS, -march=armv6k -mtune=mpcore on 3DS) and linked with src/rt and the hosts into the platform package. ZN-145 (4-byte references) stays a later memory optimisation.

Also carries, since the backlog review of 2026-10-10: ZN-485 (Spike: Zinc Next AOT and runtime on the PSP (32-bit MIPS, f32 numbers)).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 fib, the library golden and examples/bouncing-ball give interpreter-identical output in each emulator (iOS on the device)
- [ ] #2 bouncing-ball AOT maximum ball count at 60 fps is at least the interpreter figure on each target
- [ ] #3 binary sizes reported per target
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. AOT to C++ for the console cores is not in tools/build-console-core; the iOS legacy part belongs to the parked cluster and ZN-485 (spike) is Done. Evidence: grep aot in tools/build-console-core finds nothing
<!-- SECTION:NOTES:END -->
