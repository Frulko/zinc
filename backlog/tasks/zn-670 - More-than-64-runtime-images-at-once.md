---
id: ZN-670
title: More than 64 runtime images at once
status: Done
assignee: []
created_date: '2026-10-10 18:52'
updated_date: '2026-10-10 20:36'
labels:
  - gfx
  - size-S
milestone: m-27
dependencies: []
ordinal: 426410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the museum table (ZN-650.03): ZRT_DYN_IMAGES is 64, so a light table holds about 60 photo cards, and imageFromBytes (ZN-432) has the same ceiling. A limit per profile (small on a device, a few thousand on a desktop), allocated on demand.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a desktop program holds 1,000 runtime images and draws them (test)
- [x] #2 the device profiles keep their memory budget (the limit and the memory per profile are in the doc)
- [x] #3 going over the limit returns -1 and one warning, never a crash
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done: runtime/raster.cpp keeps runtime images in chunks of 64 entries allocated on first use and never moved (published with release/acquire, so producer threads never race a growth), up to ZRT_DYN_IMAGES: 4096 on desktops and the web, 64 on devices (ESP32, PS2), 4 on PS1 (its cmake); past it dyn_wrap/dyn_create (so createImage, imageFromBytes, video and camera frames) return -1 with one warning. The GL replay's runtime textures were 256 slots searched linearly: now an array indexed by the image id, grown on demand. Test tests/t1/many_images.sh: 1,000 images of 8x8, each its own colour, every cell checked, interpreted, compiled and through the GL replay (ZINC_DISPLAY=gl); 4,096 then -1 twice with one warning; a destroyed image frees its place. Docs: docs/guide/03-ui-apps.md, limit and table memory per profile (2.5 KB per 64 images on a 64-bit host, 1.8 KB on ESP32 once used, 112 bytes on PS1; before: 2.5 KB static everywhere). Device builds not run (cross pass). image_reuse, image_rect, gl_renderer, camera pass; video is the known failure. usage: n/a
<!-- SECTION:NOTES:END -->
