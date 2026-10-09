---
id: ZN-439
title: Texture importer tex-basis and compressed uploads
status: Backlog
assignee: []
created_date: '2026-10-09 07:36'
labels:
  - games
  - assets
  - size-L
milestone: m-22
dependencies:
  - ZN-434
  - ZN-435
ordinal: 207000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
basisu 2.50 as a pinned tool; KTX2; mipmaps; premultiplied alpha; sRGB; transcode per profile to BC1/BC3/BC7, ETC1/ETC2, ASTC and PVRTC1. display-gl uploads ETC1 (vc4) and BCn/ASTC (desktop). The WebGL layer gains the ETC1, ETC, ASTC and PVRTC extensions where the driver has them. Includes the texture decision record. Report: docs/reports/games/toolchain-assets-loading.md (3, 4.2, 9).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 for a 2048 px texture, the report gives pack and GPU bytes per profile
- [ ] #2 it renders in display-gl on macOS and on the Pi 3 (vc4) with ETC1 within a pixel tolerance of the RGBA path
- [ ] #3 the determinism test passes with the thread count it fixes
<!-- AC:END -->
