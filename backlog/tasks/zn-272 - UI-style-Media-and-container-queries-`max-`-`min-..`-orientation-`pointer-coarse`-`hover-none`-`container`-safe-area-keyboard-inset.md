---
id: ZN-272
title: >-
  UI style: Media and container queries: `max-*`, `min-[..]`, orientation,
  `pointer-coarse`, `hover-none`, `@container`, safe-area/keyboard inset
status: Done
assignee: []
created_date: '2026-10-07 12:57'
updated_date: '2026-10-08 08:41'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
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
- [x] #1 Feeding mouse then touch events flips `pointer-coarse:` styles (test using `ui.touchAt`).
- [x] #2 Container query settles in at most 2 layout passes (counter) and survives a resize script.
- [x] #3 The virtual keyboard inset of ZN-227 is readable as a length (`env(keyboard-inset)`) and moves a bottom-pinned bar (golden).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. + AC3: the kit Keyboard publishes ui.setKeyboardInset (an estimate on show, the measured height when the slide ends, 0 when hidden); golden/ui-kbd-inset: a bar with pb-[env(keyboard-inset)] moves up above the keyboard (values and frame hash, screenshot checked).
<!-- SECTION:NOTES:END -->
