---
id: ZN-602
title: AOT Map and Set at native speed (mapset 1.41x)
status: Backlog
assignee: []
created_date: '2026-10-09 09:48'
labels:
  - perf
  - aot
milestone: m-21
dependencies:
  - ZN-409
priority: medium
ordinal: 371270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Split from ZN-409: after typed AOT emission every M4 kernel is within 1.2x of the native toolchain except mapset (15.5 ms vs 11.0 ms) and jsonout (3.3 vs 2.6 ms, startup: ZN-592). mapset is bound by the runtime Map/Set rows (rtCall dispatch, the hash table of src/rt), not by the generated code: profile it and give the hot rows direct entry points or inline fast paths, as ZN-397 did for the host rows.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 mapset AOT <= 1.2x native (tests/bench/kernels, same machine)
- [ ] #2 Map/Set goldens and the interpreter unchanged
<!-- AC:END -->
