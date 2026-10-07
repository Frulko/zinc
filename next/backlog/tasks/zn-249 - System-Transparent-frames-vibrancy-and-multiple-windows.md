---
id: ZN-249
title: 'System: Transparent frames, vibrancy and multiple windows'
status: Backlog
assignee: []
created_date: '2026-10-07 12:21'
labels:
  - system
  - desktop
  - plugins
  - size-L
milestone: m-16
dependencies:
  - ZN-240
ordinal: 52190
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-20). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Spike S2 and S8 recorded first; `transparent: true` shows desktop content through cleared areas on macOS and on a compositing Linux session (screenshot with a known wallpaper).
- [ ] #2 `setVibrancy('sidebar')` produces a blurred backdrop (pixel-variance check on the screenshot); multiple windows only if the render roadmap exposes per-window scenes, otherwise this task splits and the second half is parked with the reason.
<!-- AC:END -->
