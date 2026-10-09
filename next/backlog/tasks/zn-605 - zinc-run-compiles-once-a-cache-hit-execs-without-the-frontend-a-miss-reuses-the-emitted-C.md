---
id: ZN-605
title: >-
  zinc run compiles once: a cache hit execs without the frontend, a miss reuses
  the emitted C++
status: Backlog
assignee: []
created_date: '2026-10-09 13:44'
labels:
  - perf
milestone: m-21
dependencies: []
priority: high
ordinal: 5126
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seen by the owner on bouncing-ball: a first zinc run shows compile twice (run 33 ms, then the zinc build subprocess 27 ms, resources 19 ms, C++ 28 ms again). runCompiled (src/main.cpp) compiles the program, bakes the resources and emits the C++ only to compute the cache key, then on a miss runs zinc build as a subprocess, which does it all again. On a hit the same work runs at every launch: a cached run of bouncing-ball takes 0.27 s against 0.14 s for the cached app alone (ZINC_FRAMES=1, M1 Pro). Key the run cache on what the frontend read (the files and their hashes, recorded beside the app at build time) plus zinc.json, the engine, the plugins and CXX, so a hit checks hashes and execs; on a miss, build in-process from the C++ already emitted (no second frontend, bake or emit). D43 accepted the 0.04 s difference with the interpreter.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a cached zinc run of bouncing-ball starts within 20 ms of the cached app alone (median of 10)
- [ ] #2 a first zinc run shows one compile step and one resource bake
- [ ] #3 editing an imported module, an asset or zinc.json still rebuilds (T1 test)
<!-- AC:END -->
