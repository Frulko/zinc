---
id: ZN-289
title: 'Layout: Conformance corpus: Yoga cases to JSON and the runner'
status: Done
assignee: []
created_date: '2026-10-07 13:08'
updated_date: '2026-10-08 19:02'
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
- [x] #1 548 generated cases extracted to JSON by a script (committed with the script and Yoga tag).
- [x] #2 `rn` passes 100% with tolerance 0; the runner prints a feature x engine matrix into `docs/reports/layout-conformance.md`.
- [x] #3 `classic` pass count recorded as the baseline and the known-fail list checked in; CI fails if a previously passing case regresses.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a
Done: tools/layout-fixtures (Python, offline) extracts Yoga v3.2.1 (042f50131) tests/generated: 548 cases into tests/golden/layout-conformance/cases.json with the Yoga calls, their zinc:ui style keys or the first unsupported feature, and the LTR boxes. Runner tests/golden/layout-conformance/main.ts builds each case from zinc:ui nodes (root flex/position dropped, as Yoga ignores them on a root) and compares at tolerance 0; tests/t1/layout_conformance.sh: rn passes all 227 expressible cases, classic baseline 190 (classic.pass, 37 in classic.known-fail), fails on any regression, reports new passes. Matrix docs/reports/layout-conformance.md (tools/layout-fixtures --report). Bugs found and fixed (separate commit): basisPercent 0 read as auto; a recycled handle looked already inserted in the parent's Yoga children (NaN after ui.remove). Gaps as tasks: ZN-380, ZN-381, ZN-382. tests/run --changed 40/40, proto-capture 4/4.
Limits: 321 skipped (unsupported zinc:ui features, measure functions, root insets, percent of an undefined size, fractional lengths); RTL assertions not used (ZN-377).
<!-- SECTION:NOTES:END -->
