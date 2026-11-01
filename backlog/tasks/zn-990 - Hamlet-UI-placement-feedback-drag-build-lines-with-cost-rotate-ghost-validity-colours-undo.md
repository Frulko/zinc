---
id: ZN-990
title: >-
  Hamlet UI: placement feedback - drag-build lines with cost, rotate, ghost
  validity colours, undo
status: Done
assignee: []
created_date: '2026-11-01 14:26'
updated_date: '2026-11-01 14:57'
labels:
  - hamlet
  - demo
  - ui
  - m3
  - size-M
milestone: m-30
dependencies: []
ordinal: 749080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
While placing: a ghost of the building lit green or red with the reason, drag to lay roads and rows with the running cost, rotate with R, right click to cancel, Ctrl+Z to undo the last placement.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Drag-build shows total cost and validity per tile
- [x] #2 R rotates buildings that have orientations and Ctrl+Z undoes the last action
- [x] #3 Right click or Escape cancels the tool
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
No building has an orientation in economy.json yet, so R has nothing to rotate; Ctrl+Z (groups per drag) is done.
<!-- SECTION:NOTES:END -->
