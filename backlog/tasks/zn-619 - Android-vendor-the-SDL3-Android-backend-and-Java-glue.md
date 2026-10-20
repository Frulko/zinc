---
id: ZN-619
title: 'Android: vendor the SDL3 Android backend and Java glue'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 14:03'
updated_date: '2026-10-16 12:12'
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
- [x] #1 the files match the release archive (checksums in the README)
- [x] #2 the desktop build is unchanged (same `libSDL3.a` object list on macOS)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Copied from SDL3-3.4.16.tar.gz (sha256 7322236c..., downloaded from github.com/libsdl-org/SDL/releases/download/release-3.4.16): src/{core,misc,filesystem,joystick,hidapi,locale,video}/android and android-project/app/src/main/java/org/libsdl/app, the directories SDL's CMakeLists.txt globs for ANDROID with audio, camera, dialog, haptic, power and sensor off (as our CMake sets them). AC1: 43 files, third_party/SDL3/ANDROID.sha256; `shasum -a 256 -c` in the extracted archive: 0 mismatches. AC2: `ar t build/third_party/SDL3/libSDL3.a | sort` in this worktree equals the main tree's (240 members, diff empty): the Android sources are globbed only under if(ANDROID).
<!-- SECTION:NOTES:END -->
