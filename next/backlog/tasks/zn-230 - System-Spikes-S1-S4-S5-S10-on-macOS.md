---
id: ZN-230
title: 'System: Spikes S1, S4, S5, S10 on macOS'
status: Review
assignee: []
created_date: '2026-10-07 12:21'
updated_date: '2026-10-07 15:28'
labels:
  - system
  - desktop
  - plugins
  - size-M
milestone: m-16
dependencies: []
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/system-integration.md (section 11, SYS-01). Read the report first: architecture (one plugin zinc:system over a 3-function native ABI, deny-by-default permissions in zinc.json, recording simulator for tests), API and per-platform choices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A decision-record section in `docs/reports/zinc-next-decisions.md` answers each spike with a measured yes/no and the chosen fallback.
- [ ] #2 Evidence includes the delivered-notification readback, the screenshots of tray/dock/menu title of the dev bundle, and the signature check (`codesign -v`).
- [x] #3 Scratch code stays out of the tree except the final prototype of the 3-function ABI.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. D27 in docs/reports/zinc-next-decisions.md answers S1, S4, S5, S10 with what was measured (dev bundle copy + ad-hoc codesign valid, bundle id and display name, notification settings readable from the bundle, hard link breaks the signature, kAEGetURL cold start delivered, 3-function spec generates). AC2 open: no delivered-notification readback (needs the permission click) and no tray/dock/menu screenshots; codesign -v and lsappinfo evidence is in D27. No scratch code kept in the tree.
<!-- SECTION:NOTES:END -->
