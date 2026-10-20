---
id: ZN-387
title: 'native_plugins_test does not link: zn::host::hostSys undefined'
status: Done
assignee: []
created_date: '2026-10-08 22:18'
labels:
  - build
  - size-S
dependencies: []
ordinal: 108000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found during ZN-380 (full build): native_plugins_test links zn_host_gfx, whose sys_host.cpp (installSys, since 29d6204d --clock) references zn::host::hostSys, defined in zn_rt (src/rt/rtcalls.cpp). The test does not link zn_rt (it builds the AOT runtime of ZN_RUNTIME_DIR), so the full build stops with 'Undefined symbols: zn::host::hostSys'. Move the HostCall pointers to a small unit both sides link, or define them in the host library.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 cmake --build build builds every target warning-free, native_plugins_test passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Closed by the backlog review of 2026-10-10 (docs/reports/backlog-review-2026-10-10.md), with the owner's approval: Probably fixed since: hostSys is now an inline variable in include/zn/host.h:34, no longer a symbol of zn_rt. Build the target native_plugins_test once; close if it links. Checked by the coordinator on 2026-10-10: `tools/build native_plugins_test` links and the test prints `native plugins: all checks passed`.
<!-- SECTION:NOTES:END -->
