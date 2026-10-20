---
id: ZN-431
title: Remove unreachable functions from the ZBC module
status: Done
assignee: []
created_date: '2026-10-09 07:35'
updated_date: '2026-10-09 10:05'
labels:
  - games
  - assets
  - size-M
  - perf
milestone: m-22
dependencies: []
ordinal: 5001
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a reachability pass before encoding, starting from main, the vtables of constructed classes, closures, and the functions that runtime rows call back. It helps both the interpreter and AOT. Report: docs/reports/games/toolchain-assets-loading.md (1.2, 5).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 game-2d ZBC is at most 30 KB (60 181 B today)
- [x] #2 every T0/T1 golden is identical in the interpreter, AOT and the device core
- [x] #3 a test with promise jobs, timers and onFrame keeps its call-backs
- [x] #4 the ESP32 export of game-2d's logic fits 48 KB
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
src/ir/opt.cpp removeUnreachable, last pass of optimize(): functions reachable from @main through direct calls and the vtables of the classes reachable code builds (plus the Dyn classes the runtime builds by name for JSON.parse and any values); a class nothing builds keeps its layout and becomes abstract when its vtable loses methods; indices renumbered in calls and vtables. ZN_KEEP_UNREACHABLE=1 turns it off.
Measured: game-2d ZBC 60,184 -> 23,810 B; its ESP32 app.bin 23,846 B (< 48 KB); hero 2775 -> 1678 functions, generated C++ 33.5 -> 28.4 MB, zinc build 105 -> 82 s, binary 21.8 -> 20.0 MB (the rest is ZN-603).
Bug found and fixed on the way: the Dyn classes are built by the runtime, not by new (the desktop-app settings test crashed before rooting them). Also found: zinc run compiled timer-only programs (usesHost covers the loop rows): fixed in 1a20f59d (only programs that draw).
Tests: tests/t1/reach_callbacks.sh (new: promise jobs, timers, onFrame, sort comparator, JSON.parse any values, in the interpreter and AOT; methods of never-built classes gone), zbc goldens refreshed (18 programs lose their dead functions), T0 82/83 then clock_real fixed, T1 oracle_diff, templates_kickstart, aot, quickjs, rc, ui, react_native, rn_showcase, animated, pan_responder, layout_bridge, canvas, svg_lottie, script; interpreter = AOT frames on bouncing-ball, nuxt-ui, rn-showcase.
usage: n/a
<!-- SECTION:NOTES:END -->
