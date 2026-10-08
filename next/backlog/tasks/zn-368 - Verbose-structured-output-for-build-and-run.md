---
id: ZN-368
title: 'Verbose, structured output for build and run'
status: Backlog
assignee: []
created_date: '2026-10-08 15:16'
labels:
  - cli
  - devtools
  - size-M
milestone: m-20
dependencies: []
ordinal: 50100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-08: the engine says nothing at run or build. Add `-v` / `--verbose` (and `-vv`) and `ZINC_LOG=module=level,...`: build phases with timings (read, parse, check, lower, optimise, emit ZBC, AOT C++, compile, link, bake fonts and images, plugin builds and cache hits, toolchain downloads), the target, profile and layout engine chosen, the plugins loaded; at run time the engine (interpreter, AOT, QuickJS), the window and renderer, frames and layout passes, warnings (missing fonts, slow frames, leaks at exit). Machine-readable with `--log-format json`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `zinc build -v` prints every phase with its duration and the cache decisions (test of the line set)
- [ ] #2 `ZINC_LOG=ui=debug zinc run` prints layout passes and their durations; nothing is printed without the option (goldens unchanged)
- [ ] #3 `--log-format json` emits one JSON object per line
<!-- AC:END -->
