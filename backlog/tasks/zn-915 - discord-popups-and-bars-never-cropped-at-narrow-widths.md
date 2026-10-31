---
id: ZN-915
title: 'discord: popups and bars never cropped at narrow widths'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-31 08:40'
labels:
  - discord
  - ui
dependencies: []
ordinal: 609460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-31 screenshots: the code language picker is cut at the right edge, the user bar cuts Logout, a reaction row and an image placeholder are clipped. Popovers must stay inside the window; bars wrap or shrink.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Popovers (language picker, emoji, GIF, menus) are clamped to the window and wrap
- [ ] #2 User bar, headers and message rows never clip text or buttons from 640 px wide up; engine fix with a test if the layout engine is at fault
<!-- AC:END -->
