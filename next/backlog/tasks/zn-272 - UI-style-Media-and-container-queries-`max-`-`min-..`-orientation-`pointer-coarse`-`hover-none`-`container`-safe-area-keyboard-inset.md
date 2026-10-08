---
id: ZN-272
title: >-
  UI style: Media and container queries: `max-*`, `min-[..]`, orientation,
  `pointer-coarse`, `hover-none`, `@container`, safe-area/keyboard inset
status: Review
assignee: []
created_date: '2026-10-07 12:57'
updated_date: '2026-10-08 07:13'
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
- [ ] #3 The virtual keyboard inset of ZN-227 is readable as a length (`env(keyboard-inset)`) and moves a bottom-pinned bar (golden).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. max-sm..2xl:, min-[Npx]:/max-[Npx]:, landscape:/portrait:, pointer-coarse:/pointer-fine:/hover-none: (flipped by touchAt/touch vs pointerAt/mouse, restyles flagged nodes only), @container with @sm/@md/@lg/@xl/@[Npx]: (settled after layout in at most 2 extra passes, ui.layoutPasses()), env(keyboard-inset) and env(safe-area-inset-*) in [..] lengths with ui.setKeyboardInset/setSafeArea. Test golden/ui-media + token rows, canary 4/4. Open: AC3 golden of a bottom-pinned bar moved by the kit Keyboard (the kit does not call setKeyboardInset yet), hover: variants still ignored. Layout chain ZN-282 parked (RN-oriented, no user for the header yet).
<!-- SECTION:NOTES:END -->
