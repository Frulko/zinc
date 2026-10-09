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
milestone: m-23
dependencies:
  - ZN-466
ordinal: 300260
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
