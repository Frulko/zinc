---
id: ZN-419
title: PERF-20 Native RGB565 raster for 16-bit panels
status: Backlog
assignee: []
created_date: '2026-10-09 07:34'
labels:
  - perf
  - size-L
milestone: m-21
dependencies:
  - ZN-194
  - ZN-195
priority: medium
ordinal: 55900
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The raster is 32-bit only; fbdev (fbdev.cpp:60-75) converts every band to 565. Template the raster on the pixel format (ZN-194, ZN-195) so fbdev and SPI panels render straight into 565.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 fbdev 565 path has no conversion pass
- [ ] #2 Pi rig fbdev stats: raster+convert time -30% or better on hero navigation
- [ ] #3 565 pixel goldens per format
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: cross-platform pass. (corrected: park proposed; it needs only the Raspberry Pi 3B+ or the Intel Mac, both available since 2026-11-07 (owner): cross-platform pass, not parked.)
<!-- SECTION:NOTES:END -->
