---
id: ZN-423
title: 'PERF-24 LTO across runtime, host and program'
status: Backlog
assignee: []
created_date: '2026-10-09 07:35'
labels:
  - perf
  - size-M
milestone: m-21
dependencies:
  - ZN-409
priority: low
ordinal: 5230
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
main.cpp:1349 links the -O2 program against separately built libzn_rt.a/libzn_host_gfx.a; host rows are hostFast function pointers, so gfx::rect and push never inline into loops (push+rect+width/height ~0.9 ms of the 2.1 ms typed script at 200k). Try ThinLTO objects and direct calls when the host is linked statically.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 measured on bouncing-ball 200k and the M4 kernels; kept only if script time drops >= 3%
- [ ] #2 build time increase recorded
<!-- AC:END -->
