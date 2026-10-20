---
id: ZN-665
title: 'Kiosk: relaunch after a crash and the system kiosk presentation on macOS'
status: Backlog
assignee: []
created_date: '2026-10-10 18:49'
labels:
  - desktop
  - packaging
  - size-M
dependencies: []
ordinal: 421410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(From the backlog review of 2026-10-10, docs/reports/backlog-review-2026-10-10.md.) An exported app meant for a public screen has to come back by itself and hide the system: relaunch after a crash or a kill (a launch agent written by `zinc export --kiosk`), the system kiosk presentation (no menu bar, no Dock, no force quit, no gestures out), start at login. Needed by the museum table (ZN-650.06).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a kiosk export killed with SIGKILL is running again within 5 s (test with a temporary HOME)
- [ ] #2 the kiosk presentation options are set on macOS and listed in the doc
- [ ] #3 `zinc export --kiosk --print` shows the files it would install; nothing is installed without the flag
<!-- AC:END -->
