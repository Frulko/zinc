---
id: ZN-615
title: 'Load a native plugin at its first call, not at compile and start'
status: Backlog
assignee: []
created_date: '2026-10-10 08:05'
labels:
  - perf
  - size-M
milestone: m-21
dependencies: []
priority: low
ordinal: 5990
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From ZN-614: a program that imports a native module dlopens its plugin at every compile and start even when the module is never called (hero imports zinc:video; its first screen plays nothing). Measured on the Intel Mac: FFmpeg's libraries load in 22 ms, so this saves about 25 ms per start for such programs. Design: when a plugin is loaded, write its exports (name, signature) beside its build in ~/.zinc/cache/<target>/plugins/<key>; on later compiles and starts register the module as deferred (exports known, no library) so the checker and Machine::load can check signatures; zn_native_call loads the library at the first call of one of its exports (src/rt/native.cpp, engine-internal, not the frozen plugin ABI).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 hero zinc -v run --interp (cached ZBC) does not load the video plugin's library until a video plays
- [ ] #2 a program calling a native module works when the module is loaded at its first call (test)
- [ ] #3 a missing plugin or a signature mismatch is still reported at compile time
<!-- AC:END -->
