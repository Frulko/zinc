---
id: ZN-984
title: >-
  Hamlet UI: build menu with categories, submenus, costs, tooltips and locked
  entries
status: Backlog
assignee: []
created_date: '2026-11-01 14:24'
labels:
  - hamlet
  - demo
  - ui
  - m3
  - size-M
milestone: m-30
dependencies: []
ordinal: 743080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pressing a category opens a flyout listing its buildings with the model icon, cost and a one line tooltip; entries not yet unlocked or unaffordable are greyed and say why; number hotkeys and Escape to drop the tool.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Categories and entries come from the economy data, not code
- [ ] #2 Tooltip shows cost, workers, inputs and outputs of the hovered building
- [ ] #3 Locked and unaffordable entries are greyed with the reason
<!-- AC:END -->
