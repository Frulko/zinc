---
id: ZN-120
title: 'Profile table and --profile (f64, f32, fx12, fx16)'
status: Done
assignee: []
created_date: '2026-10-06 22:58'
updated_date: '2026-10-07 12:22'
labels:
  - profiles
  - size-M
milestone: m-11
dependencies: []
ordinal: 40620
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
include/zn/profile.h and targets/profiles.json merged with capabilities.json: `zinc run/test --profile ps1|esp32|...` sets the number alias (f64/f32/fx12/fx16), the heap budget (enforced by the allocator), screen defaults and strict typing; the profile is part of the ZBC header.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `--profile esp32` on the host interpreter makes `number` an f32 and prints the .f32.out goldens of tests/conformance; a heap overflow gives the same error as the target
- [x] #2 zinc.json `profile` is honoured
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. usage: n/a. src/frontend/profile.{h,cpp} (table of the prototype), --profile and zinc.json profile, checker number alias + literals + ** via f64 + number[] host-call copies, strict exempts the library, heap budget in src/rt/alloc.cpp (counted global new/delete and object memory, 1 MiB interpreter headroom), tests/t1/profile.sh: 21 f32 conformance programs print their .f32.out under --profile esp32, heap overflow prints 'out of memory (heap budget 163840 bytes, asked.., in use..)' and exits 101, zinc.json profile esp32 works. Full T1 (80) and T0 (51) pass. Not done (task ZN-229): fx12/ps1 profile (prelude mixes f64), plugin out-arrays under f32 (three), heap budget in AOT builds and the ZBC header, the old simulator's ENOENT wording.
<!-- SECTION:NOTES:END -->
