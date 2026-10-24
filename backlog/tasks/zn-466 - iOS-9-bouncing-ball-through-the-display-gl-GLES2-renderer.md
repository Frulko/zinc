---
id: ZN-466
title: 'iOS 9: bouncing-ball through the display-gl GLES2 renderer'
status: Backlog
assignee: []
created_date: '2026-10-09 07:37'
labels:
  - gpu
  - handheld
  - handhelds
  - ios
  - size-M
  - parked
milestone: m-23
dependencies:
  - ZN-462
ordinal: 94300
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stage 1 uploads the software raster at scale 1 as a texture; stage 2 compiles plugins/display-gl/src/gl_renderer.cpp unchanged against an EAGL context file (next to kms.cpp and sdl.cpp), EXT_discard_framebuffer at frame end, scale 2.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/bouncing-ball runs unchanged on the iPhone 4S at 60 fps and the maximum ball count is recorded with a 90 % gate
- [ ] #2 a glReadPixels golden on the device matches the desktop display-gl render within its tolerance
- [ ] #3 gl_renderer.cpp is shared, not forked
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. iOS 9 bouncing-ball: needs the owner's iPhone 4S, the old Xcode 13.4.1 armv7 SDK and a jailbreak or free-profile signing; no targets/ios-legacy or libc++ build tool exists; far from the owner goal (the modern iOS export is ZN-624..631). Park with the iOS 9 cluster (461, 462, 466, 475, 479, 483, 497, 498). Evidence: no targets/ios-legacy, no tools/build-ios-legacy-libcxx
<!-- SECTION:NOTES:END -->
