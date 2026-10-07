---
id: ZN-238
title: 'System: Tray on macOS'
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
  - ZN-232
  - ZN-234
ordinal: 52080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-09). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Create/update/destroy with template image, title, tooltip, menu, `menuOnLeftClick`; selftest shows `isTemplate == true`, the image size and the menu tree.
- [ ] #2 Click, double-click, right-click events with bounds arrive from a real `performClick:` and from the script.
- [ ] #3 `screencapture` of the status item region exists as a reference image; `LSUIElement` tray-only app starts without a dock icon.
<!-- AC:END -->
