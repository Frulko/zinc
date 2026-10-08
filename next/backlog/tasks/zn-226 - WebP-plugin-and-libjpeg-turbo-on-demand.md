---
id: ZN-226
title: WebP plugin and libjpeg-turbo on demand
status: Done
assignee: []
created_date: '2026-10-07 11:03'
updated_date: '2026-10-08 02:51'
labels:
  - render
  - plugins
dependencies:
  - ZN-115
ordinal: 108000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up of ZN-115: libwebp (BSD-3) as a decode/encode plugin for .webp assets and captures, and libjpeg-turbo on demand where JPEG decoding speed matters (stb_image stays the default).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a .webp asset decodes to stored pixels and bakes like a PNG
- [x] #2 libjpeg-turbo path measured against stb_image on a photo-size JPEG and recorded
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. libwebp 1.5.0 vendored (third_party/libwebp, BSD-3): .webp assets decode in the baker (RIFF/WEBP magic, like a PNG), ZINC_SHOT=*.webp and zinc capture --format webp write lossless WebP (hook zrt::gfx::encode_webp_hook, installed by zinc only: AOT programs do not link libwebp). tests/golden/webp: a lossless WebP asset draws the exact pixels of tests/golden/shaped/gfx.png; the capture equals the asset byte for byte (tests/t1/webp.sh). libjpeg-turbo measured: 4032x3024 q90: stb_image 70.5 ms, turbojpeg 27.6 ms (2.55x), not linked, D34.
<!-- SECTION:NOTES:END -->
