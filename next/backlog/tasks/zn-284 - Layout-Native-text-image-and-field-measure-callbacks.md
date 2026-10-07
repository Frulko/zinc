---
id: ZN-284
title: 'Layout: Native text, image and field measure callbacks'
status: Backlog
assignee: []
created_date: '2026-10-07 13:08'
labels:
  - ui
  - layout
  - size-M
milestone: m-17
dependencies:
  - ZN-283
ordinal: 50740
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/layout-engines.md (section 8, LE-5). Decision: a pluggable layout interface, `classic` stays the default, Yoga 3.2.1 is the opt-in `rn` mode for React Native fidelity. lib/std/ui.ts is shared with the prototype: land the other developer's uncommitted work first, then hunk-only commits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A text node in a `flex: 1` row inside a `flex: 1` column wraps at its **final** width (the owner's bug case) in `rn` mode: line count and height equal a hand-computed fixture.
- [ ] #2 Callback makes no VM re-entry (same result in interpreter, AOT and `--engine quickjs`).
- [ ] #3 `lines[]` after `calculate` equals `wrapText` at the final width for 100 random strings.
<!-- AC:END -->
