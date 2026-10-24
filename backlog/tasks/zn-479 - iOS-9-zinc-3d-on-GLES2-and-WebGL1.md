---
id: ZN-479
title: 'iOS 9: zinc:3d on GLES2 and WebGL1'
status: Backlog
assignee: []
created_date: '2026-10-09 07:38'
labels:
  - 3d
  - handheld
  - handhelds
  - ios
  - webgl
  - size-L
  - parked
milestone: m-23
dependencies:
  - ZN-466
ordinal: 95800
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
render3d.ios-legacy.cpp on GLES2; libzn_webgl linked statically (no dlopen) with Api::Gles2 on EAGL for zinc:script; three.js r162 or older.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/3d/cubes and examples/three/cubes run at 60 fps on the iPhone 4S
- [ ] #2 WebGL1 conformance pass count recorded on the device
- [ ] #3 a three.js r162 sample renders through zinc:script
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. iOS 9 zinc:3d: needs the owner's iPhone 4S, the old Xcode 13.4.1 armv7 SDK and a jailbreak or free-profile signing; no targets/ios-legacy or libc++ build tool exists; far from the owner goal (the modern iOS export is ZN-624..631). Park with the iOS 9 cluster (461, 462, 466, 475, 479, 483, 497, 498). Evidence: no targets/ios-legacy, no tools/build-ios-legacy-libcxx
<!-- SECTION:NOTES:END -->
