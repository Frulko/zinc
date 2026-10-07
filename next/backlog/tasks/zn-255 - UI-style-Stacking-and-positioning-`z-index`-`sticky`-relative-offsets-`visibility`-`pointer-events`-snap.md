---
id: ZN-255
title: >-
  UI style: Stacking and positioning: `z-index`, `sticky`, relative offsets,
  `visibility`, `pointer-events`, snap
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
  - ZN-189
ordinal: 50550
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-06). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Hit test follows z order (pointer script on overlapping nodes).
- [ ] #2 Sticky header golden at three scroll offsets.
- [ ] #3 Snap test: after release the offset equals a snap point, deterministic with the virtual clock.
<!-- AC:END -->
