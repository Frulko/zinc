---
id: ZN-915
title: 'discord: popups and bars never cropped at narrow widths'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-31 08:40'
updated_date: '2026-10-31 08:59'
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
- [x] #1 Popovers (language picker, emoji, GIF, menus) are clamped to the window and wrap
- [x] #2 User bar, headers and message rows never clip text or buttons from 640 px wide up; engine fix with a test if the layout engine is at fault
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Window width drives constants.ts win/channelsW/membersShown/paneW/mainW (App.tsx sets it): picker clamped and its grid follows, cards use colW(), user bar wraps (Log out is an icon), pane overlays under 800 px. Checked on 640 px frames. The code language list lives inside the code panel, wraps.
<!-- SECTION:NOTES:END -->
