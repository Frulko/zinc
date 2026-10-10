---
id: ZN-624
title: 'iOS: hello and rn-showcase on the simulator'
status: Backlog
assignee: []
created_date: '2026-10-10 14:05'
labels:
  - mobile
  - size-M
milestone: m-26
dependencies:
  - ZN-623
ordinal: 198000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
With Xcode 26, build the generated project for `ios-sim` and run both programs (`xcrun simctl`), software raster through `SDL_Renderer` (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 screenshots of both in the report
- [ ] #2 hello's output equals its golden
- [ ] #3 the changes to `hal_sdl.cpp` are listed
- [ ] #4 states whether the Intel Mac can run the simulator (criterion 1 of ZN-372, iOS half)
<!-- AC:END -->
