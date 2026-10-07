---
id: ZN-263
title: >-
  UI style: 2D transforms: rotate, skew, `scaleX/Y`, origin; RN `transform`
  array lowering; hit testing
status: Backlog
assignee: []
created_date: '2026-10-07 12:57'
labels:
  - ui
  - style
  - size-L
milestone: m-17
dependencies:
  - ZN-174
  - ZN-191
  - ZN-251
ordinal: 50630
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-14). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Goldens: rect, border, shadow, image, text at 15, 45, 90 degrees.
- [ ] #2 Pointer hit at the corner of a rotated node and a scaled-then-rotated child.
- [ ] #3 Today's `scale` frames (proto) identical; esp32 and ps1 honour 0/90/180/270 only, others ignored with one log line.
<!-- AC:END -->
