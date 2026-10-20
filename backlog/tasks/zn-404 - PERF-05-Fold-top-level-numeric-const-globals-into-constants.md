---
id: ZN-404
title: PERF-05 Fold top-level numeric const globals into constants
status: Done
assignee: []
created_date: '2026-10-09 07:34'
updated_date: '2026-10-09 08:51'
labels:
  - perf
  - size-S
milestone: m-21
dependencies: []
priority: low
ordinal: 5040
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A module-level const GRAVITY = 240 lowers to a global; every use is GetGlobal (AOT m.globals[k]: two dependent loads), 800k loads per frame in the 200k-ball update loop, and it blocks folding. IR pass in src/ir/opt.cpp: a global with a single SetGlobal of a Const in the module init and no other store becomes that Const at each GetGlobal; hoistConsts and CSE follow.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 no GetGlobal of such globals in the AOT output of bouncing-ball and the M4 kernels
- [x] #2 interpreter and AOT outputs byte-identical on the corpus
- [x] #3 a golden test with a const read inside a loop and inside a closure
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
src/ir/opt.cpp foldConstGlobals, first pass of optimize(): a global with one SetGlobal in @main's entry block of a numeric/boolean constant (or an f64 + - * / of constants, computed with the same IEEE operations) becomes that constant at every GetGlobal the store precedes (other functions, @main's other blocks, later in the entry block). The store stays.
Result: no global reads of such constants left in the AOT output of bouncing-ball (GRAVITY, FLOOR_DAMPING, MIN_BOUNCE, KICK_SPEED, BACKGROUND, MAX_BURST) and of the M4 kernels (nbody SOLAR_MASS = 4*PI*PI, spectralnorm N); bouncing-ball 200k update loop 1.54 -> 1.28 ms per frame (headless, best of 5).
Tests: const_globals golden (loops, functions, closures, a twice-written global that stays; output = Node's), added to t1/aot (AOT = interpreter), zbc goldens of statics and closures refreshed (GetGlobal -> LoadI), tests/run --changed, aot, oracle_diff, rc, quickjs pass.
usage: n/a
<!-- SECTION:NOTES:END -->
