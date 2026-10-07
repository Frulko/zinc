---
id: ZN-226
title: WebP plugin and libjpeg-turbo on demand
status: Backlog
assignee: []
created_date: '2026-10-07 11:03'
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
- [ ] #1 a .webp asset decodes to stored pixels and bakes like a PNG
- [ ] #2 libjpeg-turbo path measured against stb_image on a photo-size JPEG and recorded
<!-- AC:END -->
