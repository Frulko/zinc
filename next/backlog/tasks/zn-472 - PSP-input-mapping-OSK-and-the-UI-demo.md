---
id: ZN-472
title: 'PSP: input mapping, OSK and the UI demo'
status: Backlog
assignee: []
created_date: '2026-10-09 07:38'
labels:
  - handheld
  - handhelds
  - psp
  - ui
  - size-M
milestone: m-23
dependencies:
  - ZN-468
ordinal: 300190
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
D-pad and Cross focus navigation, a virtual cursor on the analog nub (Select toggles), confirm button from the system setting, sceUtilityOsk for hal_text_input, a compact theme for 480x272.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/ui/kit-gallery runs unchanged (only zinc.json targets.psp) in PPSSPP with scripted input reaching three screens
- [ ] #2 OSK text reaches a text field (PPSSPP or hardware)
- [ ] #3 idle screens stay at 60 fps with damage tracking
<!-- AC:END -->
