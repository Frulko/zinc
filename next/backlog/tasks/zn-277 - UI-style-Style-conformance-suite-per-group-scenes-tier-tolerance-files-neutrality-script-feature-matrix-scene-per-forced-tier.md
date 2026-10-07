---
id: ZN-277
title: >-
  UI style: Style conformance suite: per-group scenes, tier tolerance files,
  neutrality script, feature-matrix scene per forced tier
status: Review
assignee: []
created_date: '2026-10-07 12:58'
updated_date: '2026-10-07 19:51'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-172
  - ZN-175
  - ZN-174
ordinal: 50770
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-28). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 About 30 scenes under `tests/golden/ui-style/` run in T1 in under 3 minutes.
- [x] #2 A `tools/style-neutrality` script runs the proto compare and fails on any manifest or `known` row change.
- [ ] #3 The B10 feature-matrix scene renders at forced T0, T1, T2 and T3 against per-tier goldens.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. AC2 done: tools/style-neutrality (manifest vs HEAD + proto-capture compare; mutation checked: a changed tol fails). AC1 partial: 13 scenes in tests/golden/ui-style with frame-hash goldens, tests/t1/ui_style.sh (5 s), grows with each style task as ST-28 says (UI_STYLE_BLESS=1 re-blesses). AC3 open: no forced tier (ZINC_TIER) exists until the tier backends land; B10 matrix is in bench/render/b10-matrix.ts meanwhile.
<!-- SECTION:NOTES:END -->
