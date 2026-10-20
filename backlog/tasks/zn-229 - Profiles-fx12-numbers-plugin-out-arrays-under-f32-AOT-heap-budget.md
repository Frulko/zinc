---
id: ZN-229
title: 'Profiles: fx12 numbers, plugin out-arrays under f32, AOT heap budget'
status: Done
assignee: []
created_date: '2026-10-07 12:17'
updated_date: '2026-10-08 02:58'
labels:
  - profiles
  - core
dependencies:
  - ZN-120
ordinal: 109000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-ups of ZN-120. (1) --profile ps1 (fx12): the Dyn prelude and the host signatures mix f64 and fx12 (<prelude>:107 and :110 do not type-check): make the prelude number-agnostic or compile it with its own alias, then run clock.fx12.out and async.fx12.out. (2) Native-module calls whose number[] arguments are filled by the native side (three plugin primitive(), out-array write-back): under f32 the generated copy is not written back, tests/conformance/three.ts fails under --profile esp32 (array index out of bounds); convert back after the call. (3) The heap budget is enforced by the interpreter only: bake it into zinc build for the target profile and the ZBC header (profile name). (4) modules / modules_esp32: the old simulator's ENOENT text is 'cannot open', ours 'open'.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 clock and async print their .fx12.out under --profile ps1
- [x] #2 three.ts prints three.f32.out under --profile esp32
- [x] #3 the profile and its heap budget are in the ZBC header and enforced by an AOT program
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. AC1 already held (clock/async fx12 goldens, run with ZINC_DETERMINISTIC like tests/t1/profile.sh). AC2: generated requireNative methods now copy number[] arguments into f64 arrays under a non-f64 profile and copy them back after the call (src/frontend/modules.cpp): three.ts prints three.f32.out under --profile esp32, added to tests/t1/profile.sh. AC3: ZBC version 7 carries the profile name and heap budget (after the natives; docs/ir-format.md); the runtime applies the budget when it loads a module, so an AOT program built with --profile esp32 stops with 'out of memory (heap budget 163840 bytes)' (tested in profile.sh); fib-v7.zbc added, the v6 file is refused as older. Item 4 (ENOENT wording) left as is.
<!-- SECTION:NOTES:END -->
