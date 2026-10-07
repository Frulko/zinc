---
id: ZN-289
title: 'Layout: Conformance corpus: Yoga cases to JSON and the runner'
status: Backlog
assignee: []
created_date: '2026-10-07 13:08'
labels:
  - ui
  - layout
  - size-M
milestone: m-17
dependencies:
  - ZN-282
  - ZN-283
ordinal: 50790
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/layout-engines.md (section 8, LE-10). Decision: a pluggable layout interface, `classic` stays the default, Yoga 3.2.1 is the opt-in `rn` mode for React Native fidelity. lib/std/ui.ts is shared with the prototype: land the other developer's uncommitted work first, then hunk-only commits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 548 generated cases extracted to JSON by a script (committed with the script and Yoga tag).
- [ ] #2 `rn` passes 100% with tolerance 0; the runner prints a feature x engine matrix into `docs/reports/layout-conformance.md`.
- [ ] #3 `classic` pass count recorded as the baseline and the known-fail list checked in; CI fails if a previously passing case regresses.
<!-- AC:END -->
