---
id: ZN-032
title: 'Accessors, enums and switch'
status: Done
assignee: []
created_date: '2026-10-06 09:14'
updated_date: '2026-10-06 09:27'
labels:
  - size-M
milestone: m-2
dependencies: []
ordinal: 16100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Prerequisite found when starting ZN-017 (the lang tour needs them): get accessors, numeric enums, switch with fall-through.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A program using get accessors, numeric enums and switch/default/fall-through runs with the Node output
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Accessors (get), numeric enums, switch with fall-through; golden enums_switch matches Node; ASan T1 green. Known gap: tsc literal narrowing flags comparisons we accept (documented in RESUME).
<!-- SECTION:NOTES:END -->
