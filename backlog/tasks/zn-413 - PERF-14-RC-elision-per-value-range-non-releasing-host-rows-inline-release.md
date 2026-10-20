---
id: ZN-413
title: 'PERF-14 RC elision per value range, non-releasing host rows, inline release'
status: Done
assignee: []
created_date: '2026-10-09 07:34'
updated_date: '2026-10-09 15:03'
labels:
  - perf
  - size-M
milestone: m-21
dependencies: []
priority: medium
ordinal: 5130
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/ir/rc.cpp:76 lendsForever skips retain/release of borrowed loads only when the whole function has no call or runtime call. 200k balls: 400k retain/release pairs per frame (zinc mem: 4.6 M over 10 frames) for loop elements nothing can free; op::release is out of line (6% of navigation AOT). Check only each value's live range; flag runtime rows that never release program references; inline the release fast path; take the mem-stats test out of retain.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 no Retain/Release of the loop elements in bouncing-ball's update and draw loops
- [x] #2 zinc mem retain count per frame at 200k balls < 1000 (baseline 400k)
- [x] #3 ASan corpus clean, ZN_LEAK_CHECK and destruction-order goldens unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a

Done (D50):
- src/ir/rc.cpp: lendsForever, which lent only in functions without any call, is replaced by a per-value rule. A load (GetField, GetGlobal, ArrGet, Map.get) lends its value, with no retain and no release, when:
  - no use consumes it (call argument, store, return, edge);
  - nothing in its live range may release: calls, stores of references, console output, ToStr of an object, and runtime rows that release or call back.
- What it was read from stays alive meanwhile: a global, or the anchor (the tracked root of the chain of loads). The anchor's last use moves to the lent value's last use, through liveness, lastIdx and the release-after counts.
- include/zn/runtime.h, rtMayRelease: false for the string rows (but JsonParse and the Dyn rows), the read-only Array, Map and Set members, and the graphics host rows.
- ZN_NO_LEND=1 retains every load, to measure. It is in the run cache's environment list.

Results:
- AC1: bouncing-ball's frame function (update and draw inlined) has no retain or release of the loop elements, nor of the balls array: 1 retain left (the HUD) instead of 9.
- AC2: zinc mem at 200k balls, 1 retain per frame (2 vs 22 frames: 400004 vs 400024; the 400k are the construction of the balls) instead of 400k per frame.
- Compiled 200k loop, headless, 1100 minus 100 frames, two alternations: 2.70 / 2.85 ms per frame without lending, 2.51 / 2.68 ms with it.

AC3, ASan:
- next/build-san was unusable: Swift toolchain clang++ with Apple cc, and unlinkable since ZN-229 (setHeapBudget is not compiled under ZN_SANITIZE).
- Fixed: src/rt/program.cpp guards the call under ZN_NO_MIMALLOC; third_party/sha256/sha256.c shifts bytes as WORD (UBSan, reached on every zinc run since ZN-605).
- A fresh ASan and UBSan tree (Apple clang) ran 107 programs: the run goldens, 6 kernels and rc_lend. No report; the same ZN_LEAK_CHECK exit codes with and without lending.
- dates and date_full differ under that build with and without lending alike (time zone data from the temporary tree), not from RC.

Tests:
- New tests/t0/rc_lend.sh with tests/data/rc_lend.ts:
  - lent loop elements;
  - a retained element used after console.log;
  - a temporary box released after the lent item's last use;
  - Node's output and ZN_LEAK_CHECK.
- 8 ZBC disassembly goldens regenerated (fewer RC ops, shifted offsets).
- T0 89 of 89. T1 253 of 254: macos_vibrancy only, the known ZN-394. run, corpus and aot pass.

Not done:
- Borrowed parameters (a non-inlined method on a loop element still costs a pair): ZN-606.
- The inline release fast path: measured and rejected in D46. Compiled code already skips the zinc mem counters (D46).
- The ZN_HOST_GFX=OFF link is still broken (known).
<!-- SECTION:NOTES:END -->
