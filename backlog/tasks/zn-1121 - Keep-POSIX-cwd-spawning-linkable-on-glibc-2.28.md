---
id: ZN-1121
title: Keep POSIX cwd spawning linkable on glibc 2.28
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-10 20:53'
labels:
  - bug
  - process
  - toolchain
  - size-S
milestone: m-19
dependencies: []
ordinal: 51899
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The unchanged display-gl UI export of ZN-334 reaches final AArch64 linking but fails on posix_spawn_file_actions_addchdir_np from include/zn/process_family.h. The target floor is glibc 2.28; this symbol arrived in 2.29. Reuse optional-symbol detection and the existing async-safe prepared fork fallback on desktop POSIX. Preserve cwd, PATH/env, pipes, process-group/error cleanup and the app/iOS no-fork boundary. Do not raise the target floor or rewrite the UI fixture.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 AArch64 and ARMv7 glibc-2.28 link checks no longer require a strong addchdir_np symbol; ZN-334 can rerun its actual export without a target-floor change.
- [ ] #2 The shared desktop fallback and native spawn paths retain cwd, stdio/PATH and failure cleanup in the exact process_family regression; app-library/iOS unsupported spawning never calls a null function pointer.
<!-- AC:END -->
