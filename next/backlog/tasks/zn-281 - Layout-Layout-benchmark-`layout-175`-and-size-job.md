---
id: ZN-281
title: 'Layout: Layout benchmark `layout-175` and size job'
status: Backlog
assignee: []
created_date: '2026-10-07 13:07'
labels:
  - ui
  - layout
  - size-S
milestone: m-17
dependencies: []
ordinal: 50710
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/layout-engines.md (section 8, LE-2). Decision: a pluggable layout interface, `classic` stays the default, Yoga 3.2.1 is the opt-in `rn` mode for React Native fidelity. lib/std/ui.ts is shared with the prototype: land the other developer's uncommitted work first, then hunk-only commits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `bench` entry builds the 175-node tree through a minimal tree API, runs full, one-leaf and clean cases for Yoga and, when present, for `classic` (via a headless `ui.layout()` run).
- [ ] #2 Numbers (including the so-far unmeasured `classic` AOT and interpreter times) are written to the task notes and `--check-regressions` works.
- [ ] #3 `size` of `zn_yoga` for 3 targets printed; fails above 90 KB.
<!-- AC:END -->
