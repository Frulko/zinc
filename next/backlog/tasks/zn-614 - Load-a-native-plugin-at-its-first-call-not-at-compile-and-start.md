---
id: ZN-614
title: 'Load a native plugin at its first call, not at compile and start'
status: Backlog
assignee: []
created_date: '2026-10-10 07:57'
labels:
  - perf
  - size-M
milestone: m-21
dependencies: []
ordinal: 5145
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by ZN-415: hero imports zinc:video, so every compile and every start dlopens the video plugin, whose library pulls in Homebrew's FFmpeg (avcodec with x264, x265, svt-av1, dav1d...): 142-147 ms of dynamic loading on the Intel Mac, about half of hero's warm interpreted start (0.31 s) and the gap between its cold start (1.05 s) and PERF-16's 0.8 s, though hero's first screen plays no video. The checker needs a module's descriptor (its functions and types) to compile calls: cache it beside the plugin build (~/.zinc/cache/<target>/plugins/<key>) so the compile reads it without dlopen; the interpreter and the AOT program resolve a native module when one of its functions is first called (zn::frontend::gNativeProvider from the VM's native call path, or a stub per module that loads and patches). Keep the error of a missing plugin at compile time.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 hero zinc run --interp warm (cached ZBC) <= 0.17 s on the Intel Mac and cold <= 0.9 s, with no video plugin loaded until a video plays (zinc -v shows when it loads)
- [ ] #2 a program that calls a native module still works when the module is loaded at its first call, in the interpreter and in AOT (test)
- [ ] #3 a missing plugin is still reported when the program is compiled
<!-- AC:END -->
