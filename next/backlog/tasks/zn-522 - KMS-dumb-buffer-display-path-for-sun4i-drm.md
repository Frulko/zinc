---
id: ZN-522
title: KMS dumb-buffer display path for sun4i-drm
status: Backlog
assignee: []
created_date: '2026-10-09 07:41'
labels:
  - chip
milestone: m-24
dependencies:
  - ZN-514
ordinal: 320100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Software raster presented through two DRM dumb buffers and page flips (vsync pacing, no tearing), connector and mode chosen by name (Composite-1, DPI-1, HDMI-A-1, VGA-1) from zinc.json, evdev input as in display-fbdev; raw ioctls or libdrm (MIT) static; fbdev stays the fallback. Reuse the KMS code of plugins/display-gl/src/kms.cpp. (From docs/reports/hardware/ntc-chip.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 frames are paced at the connector refresh on vkms in the CHIP-03 guest and the plane CRC matches the software surface
- [ ] #2 the connector and mode are selectable from zinc.json and listed by ZINC_KMS_INFO=1
- [ ] #3 falls back to fbdev when no DRM master is available
- [ ] #4 on hardware the PocketCHIP LCD and the composite output both show the program without tearing
<!-- AC:END -->
