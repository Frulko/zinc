---
id: ZN-287
title: 'Layout: Fix re-wrap of text at the final width in `classic`'
status: Backlog
assignee: []
created_date: '2026-10-07 13:08'
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
- [ ] #1 A regression test (grow containers nested two deep, text longer than the free width) fails before and passes after: lines fit the box.
- [ ] #2 All example goldens unchanged except entries listed and reviewed in the notes.
- [ ] #3 No extra allocation in `place` (counter).
<!-- AC:END -->
