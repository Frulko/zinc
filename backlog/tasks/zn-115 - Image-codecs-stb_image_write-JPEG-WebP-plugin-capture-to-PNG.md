---
id: ZN-115
title: 'Image codecs: stb_image_write, JPEG, WebP plugin, capture to PNG'
status: Done
assignee: []
created_date: '2026-10-06 22:57'
updated_date: '2026-10-07 11:03'
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
- [x] #1 decode fixtures for each format equal stored raw data; encode round trips
- [x] #2 PNG output size for screenshots drops (compressed, not stored) with identical pixels
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. usage: n/a. stb_image_write vendored, src/res/codec.{h,cpp} (zn_codec), stb_image now reads BMP and GIF too, runtime/gfx.cpp hook png_encoder (3 lines), tests/native/codec_test.cpp + tests/t0/codec.sh + fixtures. Hero frame 2.3 MB -> 82 KB, identical pixels; examples_pixels, ui_aot, aot pass. Not done: WebP plugin and libjpeg-turbo (task ZN-226), tools' own Python PNG writers stay (they are test tools).
<!-- SECTION:NOTES:END -->
