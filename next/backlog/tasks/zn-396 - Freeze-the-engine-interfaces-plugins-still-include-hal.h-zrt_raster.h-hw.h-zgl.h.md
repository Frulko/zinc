---
id: ZN-396
title: >-
  Freeze the engine interfaces plugins still include (hal.h, zrt_raster.h, hw.h,
  zgl.h)
status: Backlog
assignee: []
created_date: '2026-10-09 06:05'
labels:
  - plugins
  - architecture
  - size-L
dependencies: []
ordinal: 191000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From ZN-353: 21 official plugins include engine headers that native ABI v1 does not cover: hal.h (display drivers, system, webview, map), zrt_raster.h (3d, canvas2d, lottie, svg, three, video, map, mapping, remote-view, gphoto2), hw.h (board drivers), zgl.h (display-gl, mapping), SDL3 (display emulators). Either freeze each as part of the ABI (versioned, snapshot-checked like native.h) or move what they need behind native.h, so these plugins can leave the monorepo (D37).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 every official plugin's native code includes only versioned, snapshot-checked engine headers
<!-- AC:END -->
