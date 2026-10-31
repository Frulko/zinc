---
id: ZN-919
title: 'discord: image viewer with a PhotoSwipe-style animation'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-31 08:41'
updated_date: '2026-10-31 09:24'
labels:
  - discord
  - ui
dependencies: []
ordinal: 613460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-31: clicking an image opens a viewer that animates from the thumbnail (like PhotoSwipe), zoom, pan, swipe between the images of a channel, close with Escape.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Open animates from the thumbnail rectangle to fit, close animates back
- [x] #2 Zoom and pan, next/previous across the conversation's images, Escape closes
- [x] #3 Reusable piece in lib/std/kit or a plugin if it fits
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
lib/std/kit/imageviewer.ts (zinc:ui/kit openImageViewer), used by examples/discord (components/Viewer.ts). Open/close animate translate and scaleX/scaleY (zinc:ui animate) from the thumbnail's ui.screenBox: no engine gap. The thumbnail shows at once, the whole file is decoded off the UI thread (zinc:imageio load) and replaces it. Seen on frames (DISCORD_SHOTS): grow and shrink mid-flight, zoom, previous. Not exercised by test: drag-down dismiss, swipe, pinch, double click, the save dialog and the copy button (real pointer/OS).
<!-- SECTION:NOTES:END -->
