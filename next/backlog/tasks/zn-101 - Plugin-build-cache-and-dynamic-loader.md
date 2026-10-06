---
id: ZN-101
title: Plugin build cache and dynamic loader
status: Backlog
assignee: []
created_date: '2026-10-06 22:55'
labels:
  - abi
  - plugins
  - toolchain
  - size-L
milestone: m-9
dependencies:
  - ZN-099
  - ZN-100
ordinal: 40430
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Decision D2: compile a plugin's native sources with the pinned zig into ~/.zinc/cache/<target>/plugins/<name>-<hash>, vendored C libraries as a separate static archive, pkg-config for system libraries, dlopen of zn_module_open on the desktop interpreter, static link with a generated zn_register_<x>() in AOT builds, hash recorded in the manifest. Hot rebuild when sources change (for `zinc dev`).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a plugin edit rebuilds in under 5 s and only that plugin; an AOT build links the plugin statically and runs without dlopen
- [ ] #2 a missing system library gives a message naming the package to install
- [ ] #3 the clean-machine test (tests/t2/package.sh) still passes
<!-- AC:END -->
