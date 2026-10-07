---
id: ZN-099
title: zrt compatibility adapters for plugin native code
status: Review
assignee: []
created_date: '2026-10-06 22:55'
updated_date: '2026-10-07 07:43'
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
- [x] #2 overhead of a native call measured and recorded (target: under 100 ns per call)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. AC1 partly: the plugins' sqlite, process and socket host.cpp build unchanged (thunk from zinc native-gen --thunk + src/native/zrt_compat.h, libs zn_plugin_*); sqlite conformance program passes natively (ZINC_NATIVE_LIBS=Sqlite=<lib>, AOT build links and registers the module); process and socket pass a C++ driver incl. callbacks, but programs cannot pass closures to a native export yet -> ZN-167 (also: sys_process.ts tests zinc:sys, not the plugin). AC2: 60 ns per native call (bench/native_call.ts). Found ZN-166: const arrow calls cost 3 us each.
<!-- SECTION:NOTES:END -->
