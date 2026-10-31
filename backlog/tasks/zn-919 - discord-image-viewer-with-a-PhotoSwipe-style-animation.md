---
id: ZN-919
title: 'discord: image viewer with a PhotoSwipe-style animation'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-31 08:41'
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
- [ ] #1 Open animates from the thumbnail rectangle to fit, close animates back
- [ ] #2 Zoom and pan, next/previous across the conversation's images, Escape closes
- [ ] #3 Reusable piece in lib/std/kit or a plugin if it fits
<!-- AC:END -->
