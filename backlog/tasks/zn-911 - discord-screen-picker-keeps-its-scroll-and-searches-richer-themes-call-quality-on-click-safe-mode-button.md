---
id: ZN-911
title: >-
  discord: screen picker keeps its scroll and searches, richer themes, call
  quality on click, safe mode button
status: Backlog
assignee: []
created_date: '2026-10-31 07:51'
labels:
  - discord
  - ui
dependencies: []
ordinal: 605460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-31: scrolling the list of screens and windows jumps back to the top; it needs a search bar; improve the themes; clicking the connection quality shows its details; a button for safe mode.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Scrolling the screen-capture picker keeps its position while thumbnails refresh (engine fix with a test if zinc:ui loses it)
- [ ] #2 The picker has a search field filtering screens and windows by name
- [ ] #3 Themes improved: more tokens applied across the app, each theme reviewed on a frame
- [ ] #4 Clicking the call's connection indicator opens its quality details (RTT, loss, jitter, bitrate, codec, MOS)
- [ ] #5 A visible safe mode toggle in the app (not only in Account safety) wired to the safety model
<!-- AC:END -->
