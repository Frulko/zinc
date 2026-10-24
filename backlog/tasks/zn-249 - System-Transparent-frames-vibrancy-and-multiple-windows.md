---
id: ZN-249
title: 'System: Transparent frames, vibrancy and multiple windows'
status: Backlog
assignee: []
created_date: '2026-10-07 12:21'
updated_date: '2026-10-25 01:53'
labels:
  - system
  - desktop
  - plugins
  - size-L
milestone: m-16
dependencies:
  - ZN-240
ordinal: 8700
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Key-colour transparent window, app.window.transparentColor and window.setVibrancy work per AppKit readbacks (opaque=NO, NSVisualEffectView). Open: the window screenshot still shows alpha 255 on the key-colour area (test warns); multi-window split not done; spike notes S2/S8 pending.
Review 2026-10-25: kept open. (review-close proposed, corrected by the verifier) Open work remains on the Mac. The notes say spikes S2/S8 are not recorded, and zinc-next-decisions.md has no S2/S8 entry. The window screenshot still shows alpha 255 on the key-colour area (the test warns), so transparency is not proven even on macOS, and the vibrancy pixel-variance check is not done. Evidence: plugins/system window transparentColor and setVibrancy (AppKit readbacks); ZN-663 Done gives several windows
<!-- SECTION:NOTES:END -->
