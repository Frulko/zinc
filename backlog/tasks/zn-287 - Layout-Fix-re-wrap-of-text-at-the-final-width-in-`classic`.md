---
id: ZN-287
title: 'Layout: Fix re-wrap of text at the final width in `classic`'
status: Done
assignee: []
created_date: '2026-10-07 13:08'
updated_date: '2026-10-08 15:04'
labels:
  - ui
  - layout
  - size-S
milestone: m-17
dependencies:
  - ZN-282
ordinal: 50770
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/layout-engines.md (section 8, LE-8). Decision: a pluggable layout interface, `classic` stays the default, Yoga 3.2.1 is the opt-in `rn` mode for React Native fidelity. lib/std/ui.ts is shared with the prototype: land the other developer's uncommitted work first, then hunk-only commits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A regression test (grow containers nested two deep, text longer than the free width) fails before and passes after: lines fit the box.
- [x] #2 All example goldens unchanged except entries listed and reviewed in the notes.
- [x] #3 No extra allocation in `place` (counter).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Done: place() of lib/std/ui.ts wraps a text again when it ends wider than the width it was wrapped at and has several lines (grow and stretch share out the free space after measure). Found with a random search (tests/golden/classic-rewrap: 400 nested trees of rows, columns, grow, w-full, percent and fixed widths): before 15 texts had lines narrower than their box (gap), after 0; no text overflowed its box before or after. A first version also re-wrapped boxes narrower than the lines: it broke chataigne#demo (a chat bubble wrapped to 2 lines in a 1-line height) and was dropped, the narrower case keeps its lines (its height came from them). Example goldens: tools/proto-capture compare --all 42 of 42 identical; tests/run --changed passed (ui_alloc_layout: no extra allocation, the common path only compares numbers).
<!-- SECTION:NOTES:END -->
