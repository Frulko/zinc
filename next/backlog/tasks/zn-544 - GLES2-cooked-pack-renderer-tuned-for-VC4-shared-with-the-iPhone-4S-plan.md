---
id: ZN-544
title: 'GLES2 cooked-pack renderer tuned for VC4, shared with the iPhone 4S plan'
status: Backlog
assignee: []
created_date: '2026-10-09 07:45'
labels:
  - rpi
  - 3d
  - size-L
milestone: m-25
dependencies:
  - ZN-433
  - ZN-490
  - ZN-537
ordinal: 340100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The native renderer for cooked packs (the pack and cooker tasks of docs/reports/hardware/pocketjs-pocket3d.md) gets a VC4 profile: a fixed shader set (unlit, Gouraud with baked light, lightmap, matcap, fog, vertex-shader animation), at most 8 varyings, uniform-array instancing (K = 64-128), sorting by program and texture, front-to-back opaque order, no FBO switches, a clear every frame. Optional backend for plugins/three (the Zinc subset), so AOT three code can draw through it. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a diorama pack renders on the Pi 3B+ at 60 fps (720p internal, 1080p output) and matches the desktop pack viewer with SSIM >= 0.9
- [ ] #2 every shader compiles threaded on vc4 (shaderdb log)
- [ ] #3 examples/three/cubes in AOT runs at 60 fps on the Pi 3B+ through the GL backend
<!-- AC:END -->
