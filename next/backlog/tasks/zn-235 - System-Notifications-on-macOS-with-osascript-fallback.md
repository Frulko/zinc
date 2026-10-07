---
id: ZN-235
title: 'System: Notifications on macOS with osascript fallback'
status: Review
assignee: []
created_date: '2026-10-07 12:21'
updated_date: '2026-10-07 15:46'
labels:
  - system
  - desktop
  - plugins
  - size-M
milestone: m-16
dependencies:
  - ZN-232
  - ZN-234
ordinal: 52050
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-06). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Sim golden covers show with actions/reply/group/replace, permission states, cancel, `delivered()`, click/action/reply/close events from the script.
- [ ] #2 On this Mac the bundled run delivers a notification (selftest readback shows id, title, body) and the `osascript` tier works unbundled with `backend: 'osascript'`.
- [x] #3 A denied permission resolves `delivered: false` with a reason, never throws.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. plugins/system/notification.ts (Options, Action, Notification with onClick/onAction/onReply/onClose, show/cancel/delivered/requestPermission/backend/isSupported; the same id replaces and takes the events), sim notification centre in system.host.cpp (ZINC_SYSTEM_NOTIFICATION_PERMISSION), goldens notification and notification_denied (per-case 'permission' file) interpreter = AOT; denied or undecided permission resolves delivered false with the reason, never throws. macOS backend plugins/system/native/system.macos.mm (UNUserNotificationCenter with categories for actions and reply, delegate events queued for poll(); osascript through NSTask arguments when there is no bundle id); live mode when not headless/deterministic. Run on this Mac: unbundled -> backend 'osascript', delivered true (a banner was shown); dev bundle -> backend 'native', delivered false 'permission not requested' (the OS prompt needs one human click, requestPermission blocks up to 60 s for it). AC2 open: no native delivered readback until that click.
<!-- SECTION:NOTES:END -->
