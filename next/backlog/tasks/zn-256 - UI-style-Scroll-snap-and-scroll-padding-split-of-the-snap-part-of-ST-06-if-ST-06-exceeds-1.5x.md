---
id: ZN-256
title: >-
  UI style: Scroll snap and scroll padding (split of the snap part of ST-06 if
  ST-06 exceeds 1.5x)
status: Backlog
assignee: []
created_date: '2026-10-07 12:56'
labels:
  - ui
  - style
  - size-S
milestone: m-17
dependencies:
  - ZN-255
ordinal: 50560
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-07). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Wheel notch and touch fling end on snap points.
- [ ] #2 `scroll_physics.tsx` conformance output unchanged without snap props.
<!-- AC:END -->
