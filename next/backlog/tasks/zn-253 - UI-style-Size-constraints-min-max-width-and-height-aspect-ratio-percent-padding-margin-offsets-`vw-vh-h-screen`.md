---
id: ZN-253
title: >-
  UI style: Size constraints: min/max width and height, aspect-ratio, percent
  padding/margin/offsets, `vw/vh/h-screen`
status: Backlog
assignee: []
created_date: '2026-10-07 12:56'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-251
ordinal: 50530
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-04). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 40 generated cases equal the browser fixtures (+-1 px).
- [ ] #2 Golden of a card grid with `aspect-video`, `max-w-md` centred.
- [ ] #3 No allocation added to `measure` (count from ZN-189's counter).
<!-- AC:END -->
