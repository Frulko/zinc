---
id: ZN-1069
title: 'zinc:ui native host hook: a renderer chosen per target and ui.render'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-08 21:43'
labels:
  - ui
  - appkit
  - size-M
milestone: m-31
dependencies: []
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Generalise the DOM host's contract (lib/std/ui.ts ui.dom*, targets/web/dom.js) into a host module chosen per target and per zinc.json "ui": {"render": "native"}: a per-frame change buffer in the record wire format and a native measure hook for Yoga and classic leaves. Design: docs/reports/appkit-native-ui-research.md sections 6 and 9, decision D210.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc.json "ui": {"render": "native"} selects a native host; targets without one keep the drawn UI with no change
- [ ] #2 After each changed frame zinc:ui hands one change buffer (create, update, move, remove) to the host; the web DOM host uses the same contract
- [ ] #3 Yoga leaves can be measured by the host (text, controls) through a measure hook
- [ ] #4 A T0 test drives a stub host and checks the buffer for a mount, an update and a removal; the three engines agree
<!-- AC:END -->
