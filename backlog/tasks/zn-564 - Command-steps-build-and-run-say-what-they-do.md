---
id: ZN-564
title: 'Command steps: build and run say what they do'
status: Done
assignee: []
created_date: '2026-10-09 08:05'
updated_date: '2026-10-09 08:06'
labels:
  - cli
milestone: m-20
dependencies: []
ordinal: 343270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-09: zinc is not verbose enough by default; show the steps of a command. In a terminal, zinc build and zinc run print one line per step with its duration (compile, resources, C++, native, done / run interpreter or native, cached or built); nothing when stderr is a pipe (scripts, tests, CI); -q or ZINC_STEPS=0 hides them, ZINC_STEPS=1 forces them; -v keeps the module details.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc build shows compile, resources, C++, native and done lines with durations in a terminal
- [x] #2 zinc run shows compile and the engine (interpreter, native cached, or the native build on a first run)
- [x] #3 nothing is printed into a pipe; -q hides the steps
- [x] #4 T1 test steps
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
include/zn/log.h: steps(), step(), shortPath(); zn::log::Phase can also print a step. zinc build: header, compile (files, functions), resources, C++, native, done (path, size, total). zinc run: header, compile, then run interpreter / native cached / build steps of the first native run. -q and ZINC_STEPS. Help text under 'With any command'. Tests: steps (new), run_compiled, tests/run --changed 61/61. Other commands (export, pack, install, add, test) can adopt step() the same way when they show up as silent.
<!-- SECTION:NOTES:END -->
