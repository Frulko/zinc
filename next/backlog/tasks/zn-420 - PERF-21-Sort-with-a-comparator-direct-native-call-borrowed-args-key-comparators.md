---
id: ZN-420
title: >-
  PERF-21 Sort with a comparator: direct native call, borrowed args, key
  comparators
status: Done
assignee: []
created_date: '2026-10-09 07:35'
updated_date: '2026-10-10 08:50'
labels:
  - perf
  - size-M
milestone: m-21
dependencies:
  - ZN-413
priority: low
ordinal: 5200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
rtcalls.cpp:276 mergeSort calls machine.cpp:334 callComparator per comparison: 3 retains, Machine::exec, releases in the callee. Navigation AOT: mergeSort + callComparator + exec ~12% of samples. Call the comparator's native function directly with borrowed arguments in AOT; extend specializeSort to (a, b) => a.k - b.k on objects (keys extracted once, stable index sort).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 navigation AOT sort share <= 4% of samples
- [x] #2 sort goldens (stability, NaN, -0) unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The sort navigation runs is citymap's out.sort((a: i32, b: i32): number => a - b) on an i32[] (examples/maps/navigation/plugins/citymap/index.ts:178), which ZN-042's specializeSort did not take (f64[] only), so each comparison went through callComparator and Machine::exec. src/ir/opt.cpp specializeSort now also takes i32[] with (a, b) => a - b or b - a (IR: sub i32, conv to f64, ret) and finds the closure's call method per class; src/rt/rtcalls.cpp ArrSortAsc/ArrSortDesc tell f64[] from i32[] by the element class (the optimizer writes these internal rows for those two only; no runtime row added, no id moved) and mergeSortInts keeps the comparator's exact permutation: the subtraction wraps in 32 bits, so when max - min > INT32_MAX the same merge with the wrapped sign runs, else the library's stable sort (a total order, same permutation). Measured, Intel Mac, AOT navigation, ZINC_PROFILE p50 over 300 frames, 3 alternations: paint 3.02-3.11 -> 1.79-1.87 ms per frame (-40%); a 4 s sample shows no callComparator or merge any more (was 31 of ~420 active samples). Not done from the description: borrowed arguments in callComparator (ZN-417 made the callee side borrow where it can; closures' call stays owned for the runtime, D51) and key comparators (a, b) => a.k - b.k on objects: no demo hot path needs them now. tests/golden/run/sort_numbers.ts extended with i32 arrays (small and full-range values, ascending and descending, against comparators the optimizer does not take), output regenerated with Node (identical); run, aot, quickjs, rc, oracle_diff PASS. Usage: n/a.
<!-- SECTION:NOTES:END -->
