---
id: ZN-684
title: >-
  plugins/gestures: fingers owned per target and a manipulate gesture (drag,
  pinch, turn)
status: Backlog
assignee: []
created_date: '2026-10-10 19:37'
labels:
  - touch
  - ui
  - size-S
dependencies: []
ordinal: 4900
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Found by the museum table, ZN-650.03 and ZN-650.04.) The museum table wrote its own gesture code because plugins/gestures has no per-target finger ownership: several cards under several hands, each gesture owning its card, a finger added or lifted without a jump. Move it into the plugin as a manipulate gesture with inertia.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the museum table's light table uses the plugin and museum_table passes unchanged
- [ ] #2 the plugin doc describes it with an example
<!-- AC:END -->
