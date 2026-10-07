---
id: ZN-230
title: 'System: Spikes S1, S4, S5, S10 on macOS'
status: Backlog
assignee: []
created_date: '2026-10-07 12:21'
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
- [ ] #1 A decision-record section in `docs/reports/zinc-next-decisions.md` answers each spike with a measured yes/no and the chosen fallback.
- [ ] #2 Evidence includes the delivered-notification readback, the screenshots of tray/dock/menu title of the dev bundle, and the signature check (`codesign -v`).
- [ ] #3 Scratch code stays out of the tree except the final prototype of the 3-function ABI.
<!-- AC:END -->
