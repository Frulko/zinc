---
id: ZN-096
title: 'Native-module ABI: include/zn/native.h and the registry'
status: Done
assignee: []
created_date: '2026-10-06 22:54'
updated_date: '2026-10-07 06:54'
labels:
  - abi
  - plugins
  - size-M
milestone: m-9
dependencies: []
ordinal: 40380
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decision D1 (docs/reports/parity/03-plugins-targets.md section 4): grow runtime/include/zinc_abi.h v4 into next/include/zn/native.h: a C typed export table using the signature letters of include/zn/runtime.h, string/array views, handles with generations, finalizers, promise and post queues drained by the loop (thread-safe post), versioning and shutdown order (rules from Node-API, ownership from WIT: borrowed arguments, module-owned results, no exceptions). src/rt/native.cpp holds the registry (zn_register_module).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 T0 with a C fixture module: scalar, string, u8[], callback, promise completed from a thread, resource finalizer, version mismatch refused
- [x] #2 the header compiles as C99 and C++20, has no libuv or zrt types, and is documented in docs/reports/zinc-next-native-abi.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. native.h (C99/C++20, no libuv/zrt types), registry src/rt/native.cpp, C99 fixture + driver tests/native, t0 native.sh, docs/reports/zinc-next-native-abi.md. Not wired into the loader yet (next task). Status ZN_ERROR added.
<!-- SECTION:NOTES:END -->
