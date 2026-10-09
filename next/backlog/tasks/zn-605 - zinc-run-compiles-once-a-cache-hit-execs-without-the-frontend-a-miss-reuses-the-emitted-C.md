---
id: ZN-605
title: >-
  zinc run compiles once: a cache hit execs without the frontend, a miss reuses
  the emitted C++
status: Done
assignee: []
created_date: '2026-10-09 13:44'
updated_date: '2026-10-09 14:19'
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
- [x] #1 a cached zinc run of bouncing-ball starts within 20 ms of the cached app alone (median of 10)
- [x] #2 a first zinc run shows one compile step and one resource bake
- [x] #3 editing an imported module, an asset or zinc.json still rebuilds (T1 test)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a

Done, src/main.cpp:
- buildNative: the native half of zinc build (bake, C++, compile and link) as a function. zinc build calls it, and so does a compiled run, in-process with the module it just compiled: one compile, one bake, one C++ emission. The zinc build subprocess is gone.
- runCached, before any compile: ~/.zinc/cache/run/<entry>/inputs holds the engine's stamps and the environment the compiler reads, then every file the compile and the bake read, with time and size:
  - the sources, lib/std included;
  - zinc.json;
  - the assets tree (files and directories);
  - lib/fonts;
  - the plugin directories;
  - targets/capabilities.json and the Lucide icons.
  When all match, the cached app is exec'd at once.
- runCompiled, when an input changed: builds in-process. If the C++ and link key equals the cached one (a touched file, a comment), the app is kept and no C++ is compiled.
- gSourcePaths and gPluginDirs are recorded by the compile and the plugin loader.

Measured (ZINC_FRAMES=1, median of 10, M1 Pro):
- bouncing-ball, cached zinc run: 158-170 ms against 145-151 ms for the app alone, 13-19 ms more (AC1, the gap is zinc's own launch, ZN-592). Before: 0.27 s against 0.14 s.
- hero, cached run: about 0.2 s, against about 1.9 s before (its compile alone is 1.2 s; the interpreter starts in 1.5 s).
- A first run shows compile, resources and C++ once each, then the native build (AC2). bouncing-ball's native step: 1.6 s against 2.7 s with the subprocess.

Tests:
- New tests/t1/run_cache.sh, 5 s. A headless compiled run of a project with an import and a baked PNG checks:
  - first run;
  - hit without compile;
  - module edited: rebuilt;
  - asset edited: rebuilt;
  - hit again;
  - touched module: compiled, no native build;
  - zinc.json edited: compiled, no native build (AC3).
- tests/run --changed: 20 passed.

Docs: D43 completed (ZN-605 sentence).
<!-- SECTION:NOTES:END -->
