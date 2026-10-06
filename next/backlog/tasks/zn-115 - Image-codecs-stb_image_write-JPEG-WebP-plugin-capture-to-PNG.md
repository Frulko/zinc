---
id: ZN-115
title: 'Image codecs: stb_image_write, JPEG, WebP plugin, capture to PNG'
status: Backlog
assignee: []
created_date: '2026-10-06 22:57'
labels:
  - rendering
  - size-S
milestone: m-8
dependencies: []
ordinal: 40570
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
stb_image gains JPEG/BMP/GIF decode (already vendored, enable the formats), stb_image_write for PNG/JPEG/BMP output (replaces the hand-written PNG encoder in tools and the host), libwebp as a plugin (BSD-3), libjpeg-turbo on demand for speed. `ZINC_SHOT` and `zinc capture` use the writer; zlib/miniz for deflate size.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 decode fixtures for each format equal stored raw data; encode round trips
- [ ] #2 PNG output size for screenshots drops (compressed, not stored) with identical pixels
<!-- AC:END -->
