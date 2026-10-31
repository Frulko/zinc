---
id: ZN-918
title: 'discord: images sent by upload show in the conversation'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-31 08:41'
updated_date: '2026-10-31 09:23'
labels:
  - discord
  - ui
dependencies: []
ordinal: 612460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-31 screenshot: an uploaded image appears as an empty grey block in the message list.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Attachments of images render (thumbnail at the right ratio, placeholder while loading, error state)
- [x] #2 Test with the fake Discord attachments
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause: zinc:gfx imageFromBytes (src/res/codec.cpp, the decoder programs link) read only PNG and JPEG, while the app asks Discord's media proxy for WebP (format=webp): the picture stayed -1 for ever, an empty box. The fake CDN answered PNG for that query, which hid it. Fix in the engine: codec.cpp decodes WebP with libwebp (decoder split from the encoder as zn_webp_dec, linked by zn_codec and in the AOT/export link lists); the fake sends a real WebP and proxy_url; cdn.ts remembers failed pictures and Content.tsx draws an error state (icon and text, at the picture's own ratio). Tests: tests/t0/webp_bytes.sh (interpreter, QuickJS, AOT), discord golden re-recorded (media proxy path), the error state in tests/t1/discord_viewer.sh.
<!-- SECTION:NOTES:END -->
