---
id: ZN-615
title: 'Load a native plugin at its first call, not at compile and start'
status: Done
assignee: []
created_date: '2026-10-10 08:05'
updated_date: '2026-10-10 11:32'
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
- [x] #1 hero zinc -v run --interp (cached ZBC) does not load the video plugin's library until a video plays
- [x] #2 a program calling a native module works when the module is loaded at its first call (test)
- [x] #3 a missing plugin or a signature mismatch is still reported at compile time
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-10. The first loadPlugin of a build writes its module's exports (name, signature) to exports in the cache entry; later compiles and starts register the module from it as deferred (src/rt/native_lazy.h, zn::rt::registerDeferredModule: exports without code, no init/poll/shutdown), so the checker and Machine::load check signatures as before, and zn_native_call loads the library at the first call (zn_register_module then replaces the deferred module in place). Not the frozen ABI: include/zn/native.h unchanged.
AC1: hero, cached interpreted run, second start: no plugin.dylib and no FFmpeg loaded (DYLD_PRINT_LIBRARIES), zinc -v shows the cache checks only. Start 326 -> 300 ms (10 starts x 3, Intel Mac).
AC2/AC3: tests/t1/native_lazy.sh: a project plugin answers its first call when deferred, an import-only program never loads it, a signature mismatch ('the Spec says s>i, the module has i>i') and a missing module ('no plugin provides it') still fail at compile time.
Left: buildPlugin's cache check still costs zinc:video 34 ms per start (pkg-config through sh, spec regeneration): ZN-617.
Tests: native_lazy plus the whole T1 tier (tests/run --changed fell back to it): only the known machine failures (tls, macos_window, three_3d, video, webgl_conformance). usage: n/a
<!-- SECTION:NOTES:END -->
