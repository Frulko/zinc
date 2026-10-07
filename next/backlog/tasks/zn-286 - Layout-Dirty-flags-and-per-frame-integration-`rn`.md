---
id: ZN-286
title: 'Layout: Dirty flags and per-frame integration (`rn`)'
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
  - ZN-285
ordinal: 50760
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/layout-engines.md (section 8, LE-7). Decision: a pluggable layout interface, `classic` stays the default, Yoga 3.2.1 is the opt-in `rn` mode for React Native fidelity. lib/std/ui.ts is shared with the prototype: land the other developer's uncommitted work first, then hunk-only commits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Changing a text marks only that node and ancestors dirty; a paint-only change (opacity) causes zero `calculate` work (counter).
- [ ] #2 Scroll views, `layoutLayers` and `applyAnchors` give identical results to `classic` on the layers/anchors tests of `docs/ui.md`.
- [ ] #3 The hero page renders in `rn` mode with no crash and a recorded golden.
<!-- AC:END -->
