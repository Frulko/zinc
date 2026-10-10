---
id: ZN-619
title: 'Android: vendor the SDL3 Android backend and Java glue'
status: Backlog
assignee: []
created_date: '2026-10-10 14:03'
labels:
  - mobile
  - size-S
milestone: m-26
dependencies: []
ordinal: 192000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Restore `src/video/android`, `src/core/android`, the Android audio-free subset and `android-project/app/src/main/java/org/libsdl/app` of SDL 3.4.16 in `next/third_party/SDL3`; README row updated (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the files match the release archive (checksums in the README)
- [ ] #2 the desktop build is unchanged (same `libSDL3.a` object list on macOS)
<!-- AC:END -->
