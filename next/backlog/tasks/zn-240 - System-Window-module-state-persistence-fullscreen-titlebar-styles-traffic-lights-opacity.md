---
id: ZN-240
title: >-
  System: Window module: state persistence, fullscreen, titlebar styles, traffic
  lights, opacity
status: Backlog
assignee: []
created_date: '2026-10-07 12:21'
labels:
  - system
  - desktop
  - plugins
  - size-M
milestone: m-16
dependencies:
  - ZN-233
  - ZN-232
ordinal: 52100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-11). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 State file round trip in a temp dir; clamping to displays tested with injected display rectangles (pure function, T0).
- [ ] #2 Selftest reads `NSWindow` style mask and traffic-light button origins equal to the configured position after a resize and after fullscreen toggling.
- [ ] #3 `onCloseRequested` + `hide` + tray click `show` loop works in sim and live.
<!-- AC:END -->
