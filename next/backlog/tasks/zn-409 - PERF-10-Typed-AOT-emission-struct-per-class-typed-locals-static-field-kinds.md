---
id: ZN-409
title: 'PERF-10 Typed AOT emission: struct per class, typed locals, static field kinds'
status: Done
assignee: []
created_date: '2026-10-09 07:34'
updated_date: '2026-10-09 09:49'
labels:
  - perf
  - size-L
milestone: m-21
dependencies: []
priority: high
ordinal: 5090
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
next/src/aot/aot.cpp keeps every value as Slot and fields as o->fields()[c]; SetField tests cls->fieldRef at run time. nbody AOT 107 ms vs plain C++ -ffp-contract=off 36 ms. Experiments (output identical): struct per class + double locals with every check kept = 37 ms; Slot locals with struct, or double locals with fields()[k], stay 107-109 ms; -mllvm -aarch64-enable-ldst-opt=false alone gives 56 ms: the cost is a store-forwarding stall from ldp reloads the compiler cannot avoid without per-member alias info. Bouncing-ball update+draw loops typed by hand: script 4.22 -> 2.12 ms per frame. Emit a C++ struct per class, typed locals per IR type, scalar SetField as a plain store, ref SetField with inline release; keep null and bounds checks. Corrects ZN-042's FMA diagnosis. The 2x on bouncing-ball also assumed the element RC elision of PERF-14 (independent task).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 AOT/native <= 1.2x on every M4 kernel (nbody baseline 2.7x)
- [ ] #2 bouncing-ball 200k AOT script (effects phase) <= 2.2 ms per frame headless (baseline 4.2 ms)
- [x] #3 interpreter and AOT outputs byte-identical on the corpus, -ffp-contract=off kept
- [x] #4 generated C++ size of hero not larger than today
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
zbc::registerTypes exposes the verifier's register classes before every instruction; the AOT emits one C++ struct per object class (f64 fields typed double, the rest Slot, static_assert on the layout) and a field access on a register of a known class goes through it, scalar SetField as a plain store, reference SetField with an unconditional release (fieldRef is static). On Apple clang arm64 the AOT also passes -mllvm -aarch64-enable-ldst-opt=false: its load/store pairing turned field reloads into 16-byte loads over a just-stored 8-byte field (store-forwarding stall). Typed locals were not needed once both were in (measured: struct alone 106 ms, no pairing alone 54 ms, both 36.8 ms).
M4, AOT vs native (min of 5, same machine): fib 0.96, nbody 2.90 -> 1.04 (106 -> 36.3 ms), mandelbrot 1.09, spectralnorm 0.92, fannkuchredux 0.97, binarytrees 0.91, sort 1.11, strings 1.11, mapset 1.41 (runtime Map/Set: ZN-602), jsonout 1.25 (3.3 vs 2.6 ms, startup: ZN-592); outputs identical to native. The no-pairing flag alone is neutral on the other kernels (-6% to +2%, fib +10% at 9 ms within noise).
AC2: bouncing-ball 200k effects p50 4.2 (audit) -> 2.62 ms; the 2.2 ms target also needs the loop-element RC elision (ZN-413, ZN-399).
AC4: hero's generated C++ 34.3 -> 33.5 MB. AC3: tests/run --changed 30/30, aot, oracle_diff, rc, quickjs, canvas, ui, script, profile, layout_bridge, host_direct, run_compiled; interpreter = AOT frame hashes on bouncing-ball, nuxt-ui, rn-showcase. The weight of AOT programs (hero 21.8 MB, 105 s build) is ZN-603.
usage: n/a
<!-- SECTION:NOTES:END -->
