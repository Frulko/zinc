---
id: ZN-332
title: 'Plugins build with the pinned zig by default, the system compiler on request'
status: Backlog
assignee: []
created_date: '2026-10-08 14:34'
labels:
  - distribution
  - toolchain
  - size-S
milestone: m-19
dependencies:
  - ZN-331
ordinal: 55230
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
compilers() in src/tc/plugin_build.cpp prefers $CXX/$CC, then the system c++, then the pinned zig; the plugin cache key hashes the compiler command, so two machines compute different keys and a prebuilt binary can never match. Make the pinned zig the default (ZINC_PLUGIN_CC=system or zinc.json opts back in to the system compiler) so the key depends only on sources, flags, ABI headers and target.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the same plugin computes the same cache key on macOS and in a Linux container
- [ ] #2 ZINC_PLUGIN_CC=system still builds with the system compiler and gets a different key
- [ ] #3 the plugin tests of tests/t1 pass with zig as the compiler
<!-- AC:END -->
