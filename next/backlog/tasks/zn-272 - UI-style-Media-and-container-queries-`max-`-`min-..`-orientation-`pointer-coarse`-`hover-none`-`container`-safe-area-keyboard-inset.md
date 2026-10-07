---
id: ZN-272
title: >-
  UI style: Media and container queries: `max-*`, `min-[..]`, orientation,
  `pointer-coarse`, `hover-none`, `@container`, safe-area/keyboard inset
status: Backlog
assignee: []
created_date: '2026-10-07 12:57'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-251
  - ZN-227
  - ZN-228
ordinal: 50720
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-23). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Feeding mouse then touch events flips `pointer-coarse:` styles (test using `ui.touchAt`).
- [ ] #2 Container query settles in at most 2 layout passes (counter) and survives a resize script.
- [ ] #3 The virtual keyboard inset of ZN-227 is readable as a length (`env(keyboard-inset)`) and moves a bottom-pinned bar (golden).
<!-- AC:END -->
