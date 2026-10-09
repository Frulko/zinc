---
id: ZN-446
title: Engine splash from the first frame
status: Backlog
assignee: []
created_date: '2026-10-09 07:36'
labels:
  - games
  - assets
  - size-M
milestone: m-22
dependencies:
  - ZN-435
ordinal: 214000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
splash key. The baker stores the splash, pre-scaled in the target's framebuffer format, as the first boot-pack entry, and inline in index.html for the browser. The host opens the window, presents it, then compiles, bakes, loads plugins and mounts packs. The window is shown only after its first present (no white flash). Exports generate the OS splash per target. Report: docs/reports/games/toolchain-assets-loading.md (7.2, 7.3).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the time from exec to the splash on screen is measured on macOS, Linux and the Pi 3 and recorded
- [ ] #2 in the browser the splash is in the HTML before app.js runs
- [ ] #3 headless runs are unchanged
<!-- AC:END -->
