---
id: ZN-415
title: 'PERF-16 zinc run / zinc dev startup: faster passes and a ZBC cache'
status: Done
assignee: []
created_date: '2026-10-09 07:34'
updated_date: '2026-10-10 07:58'
labels:
  - perf
  - size-M
milestone: m-21
dependencies: []
priority: medium
ordinal: 5150
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc run examples/hero spends 1.7 s before the first instruction: parse 85, check 227, lower 436, optimise 100, RC 353, emit 269 ms (program 36 ms). rc.cpp liveness uses dense blocks x values byte vectors. Sparse liveness, profile lower/emit for quadratic spots, cache the ZBC by hash of sources + profile + engine version.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 hero zinc run to first frame <= 100 ms with a warm cache, <= 0.8 s cold (baseline 1.7 s)
- [x] #2 cache invalidated by any source, profile or engine change (test)
- [x] #3 zinc -v phase times recorded in the task
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured on the Intel Mac (i7-8850H, the development machine since 2026-10-10; the baseline of the task was an M1). zinc -v phases of examples/hero, ms, before -> after: read and parse 133 (+~150 of plugin loading inside it) -> unchanged, check 315 -> 155, lower to IR 357 -> 66, optimise 138 -> 137, reference counting 650 -> 68, emit ZBC 274 -> 92; total compile 1.86 -> 0.81 s. Quadratic spots fixed: rc.cpp liveness (dense blocks x values byte vectors, 1,109 x 6,522 in one function) -> bit sets over the tracked values, successors computed once, virtual-call throw test per vtable slot; emit.cpp register-allocation liveness -> bit sets; lower.cpp simplifyParams (one whole-function rewrite per removed block parameter: 292 ms) -> rounds with a representative table; check.cpp forward-declaration and TDZ scans (each top-level declaration walked every statement above) -> one running set. ZBC byte-identical before/after on 46 programs (hero, nuxt-ui, rn-showcase, breakout, zed-editor sample, tests/conformance/*.ts); checker, tdz, ir, zbc, rc_refcast, rc_lend, irformat, aot PASS. ZBC cache for interpreted runs (zinc dev, --interp, headless, --profile): ~/.zinc/cache/zbc/<entry+profile> with program.zbc, the native modules the compile loaded, the baked resources and the inputs (the stamps of every source, zinc.json, lib/std, lib/compat, fonts, assets, plugin dirs, under a signature of the engine binary, version and compiler variables); not for ZINC_DETERMINISTIC test runs; ZINC_NO_CACHE; 64 entries kept. AC#2: tests/t1/zbc_cache.sh (source, imported file, profile, compiler option, engine binary, lib/std module, ZINC_NO_CACHE) PASS; run_cache (ZN-605, the native cache) PASS. The native run cache (ZN-605) now lists lib/std too (a lib/std edit used to start a stale executable). hero interpreted to first frame and exit: cold 2.06 -> 1.05 s, warm 2.06 -> 0.31 s; breakout warm 0.02 s; hero native warm 0.11 s. AC#1 not met on hero: 142-147 ms of the warm start is the video plugin's dlopen of Homebrew's FFmpeg (hero imports zinc:video); moved to ZN-614 (load a native module at its first call). Perf log: docs/reports/zinc-next-perf.md PERF-16. Usage: n/a.
<!-- SECTION:NOTES:END -->
