---
id: ZN-614
title: 'Plugin start-up cost: one pkg-config query per plugin, not sixteen'
status: Done
assignee: []
created_date: '2026-10-10 07:57'
updated_date: '2026-10-10 08:16'
labels:
  - perf
  - size-M
milestone: m-21
dependencies: []
ordinal: 5145
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by ZN-415: hero's warm interpreted start (0.31 s) spent 139 ms in buildPlugin's cache check of the video plugin, which runs at every compile and start: for each of its 4 system libraries it spawned a shell for command -v pkg-config, then pkg-config --exists, --cflags and --libs (16 processes). First thought to be the dlopen of FFmpeg; measured: loading libavutil, libswscale, libavcodec and libavformat takes 22 ms, so lazy loading of native modules would save about 25 ms per start (follow-up ZN-615, low priority). Fix: haveCommand remembered per process, one pkg-config query for all of a plugin's libraries (the per-library query only names the missing one when it fails).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the video plugin's cache check at start costs one pkg-config query (4 processes), not 16: zinc -v shows <= 40 ms on the Intel Mac (139 ms before)
- [x] #2 a missing system library is still named in the error (plugin_build test)
- [x] #3 hero warm interpreted start (cached ZBC) measured before/after on an idle machine, numbers in the notes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause found by measuring: buildPlugin's cache check (run at every compile and start) spawned 16 processes for zinc:video (command -v pkg-config + pkg-config --exists/--cflags/--libs for each of libavformat, libavcodec, libavutil, libswscale), not the dlopen of FFmpeg (loading the 4 FFmpeg libraries takes 22 ms; lazy loading is ZN-615, low priority). Fix in src/tc/plugin_build.cpp: haveCommand remembered per process, one query '(pkg-config --exists L && pkg-config --cflags L && echo @@ && pkg-config --libs L)' for all of a plugin's libraries; when it fails, the per-library query names the missing one. The combined flags changed the video plugin's cache key once (rebuilt once). Idle Intel Mac, hero zinc run --interp, ZINC_HEADLESS=1 ZINC_FRAMES=1: video cache check 139 -> 32 ms; warm (cached ZBC) 0.31 -> 0.20 s; cold 1.05 -> 0.95 s. Tests: plugin_build (missing-library message), plugin_prebuilt, native_plugins, camera PASS. Full T1 after ZN-415 and this: 253 passed, 4 known failures (tls ZN-610; three_3d, video, webgl_conformance ZN-612). Usage: n/a.
<!-- SECTION:NOTES:END -->
