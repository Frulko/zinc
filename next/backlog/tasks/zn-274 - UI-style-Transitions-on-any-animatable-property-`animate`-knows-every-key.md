---
id: ZN-274
title: 'UI style: Transitions on any animatable property; `animate()` knows every key'
status: Backlog
assignee: []
created_date: '2026-10-07 12:57'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-191
  - ZN-273
ordinal: 50740
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-25). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Virtual-clock samples at 0, 50, 100% for opacity, translate, rotate, colour, width.
- [ ] #2 Opacity and transform transitions record nothing per frame (ZN-191 criterion).
- [ ] #3 esp32 caps at 8 concurrent tweens and jumps beyond (test).
<!-- AC:END -->
