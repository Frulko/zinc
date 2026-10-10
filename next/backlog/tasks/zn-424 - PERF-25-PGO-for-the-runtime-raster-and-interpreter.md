---
id: ZN-424
title: 'PERF-25 PGO for the runtime, raster and interpreter'
status: Done
assignee: []
created_date: '2026-10-09 07:35'
updated_date: '2026-10-10 09:29'
labels:
  - perf
  - size-M
milestone: m-21
dependencies: []
priority: low
ordinal: 5240
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
No profile-guided build today. Collect profiles from the M4 kernels, the render corpus and three demos; build zn_rt, zn_host_gfx and zinc with -fprofile-use; optional zinc build --pgo.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 release build with versioned profile data
- [x] #2 M4 interpreter and render corpus measured; kept only if >= 5%
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured and not adopted (D54). tools/pgo: an instrumented build (build-pgogen, -fprofile-instr-generate), the training set (M4 kernels interpreted from ZBC, a compile of examples/hero, 90 headless frames of hero, nuxt-ui and bouncing-ball with LLVM_PROFILE_FILE), llvm-profdata merge (10.7 MB), and build-pgo with -fprofile-instr-use. AC#1: the profile is reproducible from the sources by tools/pgo rather than committed (it is tied to the compiler and the sources). AC#2, median of 5 on the idle Intel Mac, normal -> PGO: binarytrees 59 -> 56 ms, closure_call 314 -> 305, dynsum 72 -> 68, empty 27 -> 29, fannkuchredux 1747 -> 1669, fib 72 -> 77, jsonout 29 -> 29, mandelbrot 148 -> 152, mapset 85 -> 82, nbody 859 -> 893, sort 171 -> 169, spectralnorm 954 -> 913, strings 88 -> 89; compile hero 843 -> 822; bouncing-ball 200k effects 19.3-19.5 -> 19.75-19.9 ms; hero frames unchanged. Below the 5% threshold: the release build stays as it is. Usage: n/a.
<!-- SECTION:NOTES:END -->
