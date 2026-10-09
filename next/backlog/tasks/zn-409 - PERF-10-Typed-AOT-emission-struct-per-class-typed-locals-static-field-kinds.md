---
id: ZN-409
title: 'PERF-10 Typed AOT emission: struct per class, typed locals, static field kinds'
status: Backlog
assignee: []
created_date: '2026-10-09 07:34'
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
- [ ] #3 interpreter and AOT outputs byte-identical on the corpus, -ffp-contract=off kept
- [ ] #4 generated C++ size of hero not larger than today
<!-- AC:END -->
