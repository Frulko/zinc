---
id: ZN-282
title: 'Layout: `zn::ui::Layout` interface and `classic` adapter'
status: Backlog
assignee: []
created_date: '2026-10-07 13:07'
updated_date: '2026-10-08 05:51'
labels:
  - ui
  - layout
  - size-M
milestone: m-17
dependencies: []
ordinal: 50720
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/layout-engines.md (section 8, LE-3). Decision: a pluggable layout interface, `classic` stays the default, Yoga 3.2.1 is the opt-in `rn` mode for React Native fidelity. lib/std/ui.ts is shared with the prototype: land the other developer's uncommitted work first, then hunk-only commits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `src/host/layout.h` with the calls of section 5; `classic` implements it with the current code, no behaviour change.
- [ ] #2 All example pixel goldens identical (tolerance 0) on interpreter and AOT.
- [ ] #3 `measure()` allocation count not higher (ZN-189 counter).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
parked 2026-10-07: the classic adapter is the layout code of lib/std/ui.ts (measure/place/layout), which carries another developer's uncommitted work in the same hunks; the interface header alone would have no user. Resume with ZN-250 when git diff lib/std/ui.ts is clean of that work.
<!-- SECTION:NOTES:END -->
