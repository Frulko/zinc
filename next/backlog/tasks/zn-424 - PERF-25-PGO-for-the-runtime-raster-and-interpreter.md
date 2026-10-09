---
id: ZN-424
title: 'PERF-25 PGO for the runtime, raster and interpreter'
status: Backlog
assignee: []
created_date: '2026-10-09 07:35'
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
- [ ] #1 release build with versioned profile data
- [ ] #2 M4 interpreter and render corpus measured; kept only if >= 5%
<!-- AC:END -->
