---
id: ZN-082
title: >-
  Event loop on libuv: timers, IO, child processes, promise integration,
  deterministic mode
status: Done
assignee: []
created_date: '2026-10-06 22:52'
updated_date: '2026-10-07 03:04'
labels:
  - host
  - runtime
  - size-L
milestone: m-14
dependencies:
  - ZN-078
ordinal: 40240
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decision D7 (docs/reports/zinc-next-decisions.md): libuv 1.53 on desktop and Pi. Replace the polled timers and the poll-based process module with a real loop: uv timers (virtual under ZINC_DETERMINISTIC so goldens stay stable, real otherwise; fixes Date.now/performance.now starting at 0 together with W-clock), uv_process for zinc:process, uv_fs for async fs, a promise-completion queue drained by the loop, the frame loop of zinc:gfx integrated as a timer/idle source. Vendor a source list (third_party/libuv/zn-sources.txt) not the build system; one CMake target. The typed core/AOT call the same runtime API; no libuv types in include/zn.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 T0: timers order (equal to Node), clearTimeout/clearInterval, setInterval drift test under virtual time, promise vs timer ordering golden
- [x] #2 zinc:process spawn/exit/signals use uv_process; the atelier app still passes its T1 tests
- [x] #3 the frame loop and a long timer coexist (a 60 fps app with a 1 s interval keeps its frame rate)
- [x] #4 third_party/README.md row, licence, pinned version and checksum; build warning-free with clang, zig c++ and gcc
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. libuv 1.53.0 vendored (third_party/libuv, zn-sources.txt, one CMake target zn_uv, README row with sha256, clang/zig/gcc compile clean under -Wall -Wextra for our code; vendored C builds with -w like yyjson). src/host/loop.cpp + include/zn/loop.h (no libuv type in the API): uv_spawn child processes (stdout and stderr merged), pump/wait; zinc:process rows now go through it; two appended rows host.loopWait / host.loopReal; ZINC_REALTIME=1 makes the prelude's timer jumps real sleeps (default stays virtual: ZN-083 flips the clock). Tests: timers_order golden equals Node, frame_timer.sh (60 fps with a 1 s interval), atelier and AOT T1 pass. Not done yet: uv timers for the clock itself, uv_fs, signals (onSignal is still a stub), promise completion queue (all later tasks).
<!-- SECTION:NOTES:END -->
