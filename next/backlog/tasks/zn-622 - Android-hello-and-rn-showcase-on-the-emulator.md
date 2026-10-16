---
id: ZN-622
title: 'Android: hello and rn-showcase on the emulator'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-10 14:04'
labels:
  - mobile
  - size-M
milestone: m-26
dependencies:
  - ZN-619
  - ZN-621
ordinal: 196000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
With the SDK 35+ and NDK r28c+, build the generated project (arm64-v8a and x86_64) and run both programs on an emulator, software raster through `SDL_Renderer` (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 screenshots of both in the report
- [ ] #2 the hello output in logcat equals its golden
- [ ] #3 what had to change in `hal_sdl.cpp` is listed (criterion 1 of ZN-372, Android half)
<!-- AC:END -->
