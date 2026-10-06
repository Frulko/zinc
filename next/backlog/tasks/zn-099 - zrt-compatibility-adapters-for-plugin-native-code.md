---
id: ZN-099
title: zrt compatibility adapters for plugin native code
status: Backlog
assignee: []
created_date: '2026-10-06 22:55'
labels:
  - abi
  - plugins
  - size-M
milestone: m-9
dependencies:
  - ZN-098
ordinal: 40410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decision D3: src/native/zrt_compat maps the prototype's zrt types (String, Array<T>, Fn, Promise<T>, Poller, g_err) onto the ABI views so sqlite.host.cpp, process.host.cpp and socket.host.cpp build unmodified; one runtime owner (the host library already links runtime/).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 sqlite, process and socket plugin native sources build with no source change and pass their conformance programs (sqlite.ts, sys_process.ts, socket.ts) on macOS
- [ ] #2 overhead of a native call measured and recorded (target: under 100 ns per call)
<!-- AC:END -->
