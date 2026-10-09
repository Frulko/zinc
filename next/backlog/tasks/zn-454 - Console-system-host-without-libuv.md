---
id: ZN-454
title: Console system host without libuv
status: Backlog
assignee: []
created_date: '2026-10-09 07:37'
labels:
  - handheld
  - handhelds
  - host
  - size-M
milestone: m-23
dependencies:
  - ZN-453
ordinal: 300010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
next/targets/console/host_console.cpp: the HostSys and HostLoop rows (args, env, platform, real clock, wait, epoch, files through stdio, storage as a JSON file) without libuv, in the style of targets/wasm/host_wasi.cpp but with a real clock and real files; unknown rows reported once. A per-platform hook supplies now_us, sleep_us and the writable app directory. Shared by psp, vita, n3ds and ios-legacy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 builds with clang on macOS with no libuv symbol linked (checked with nm)
- [ ] #2 a T0 test runs the library golden and a timers program through this host and matches the interpreter output
- [ ] #3 the list of supported rows is documented in the file header
<!-- AC:END -->
