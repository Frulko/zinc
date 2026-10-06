---
id: ZN-082
title: >-
  Event loop on libuv: timers, IO, child processes, promise integration,
  deterministic mode
status: Backlog
assignee: []
created_date: '2026-10-06 22:52'
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
- [ ] #1 T0: timers order (equal to Node), clearTimeout/clearInterval, setInterval drift test under virtual time, promise vs timer ordering golden
- [ ] #2 zinc:process spawn/exit/signals use uv_process; the atelier app still passes its T1 tests
- [ ] #3 the frame loop and a long timer coexist (a 60 fps app with a 1 s interval keeps its frame rate)
- [ ] #4 third_party/README.md row, licence, pinned version and checksum; build warning-free with clang, zig c++ and gcc
<!-- AC:END -->
