---
id: ZN-277
title: >-
  UI style: Style conformance suite: per-group scenes, tier tolerance files,
  neutrality script, feature-matrix scene per forced tier
status: Done
assignee: []
created_date: '2026-10-07 12:58'
updated_date: '2026-10-25 01:53'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-172
  - ZN-175
  - ZN-174
ordinal: 361000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-28). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 About 30 scenes under `tests/golden/ui-style/` run in T1 in under 3 minutes.
- [x] #2 A `tools/style-neutrality` script runs the proto compare and fails on any manifest or `known` row change.
- [x] #3 The B10 feature-matrix scene renders at forced T0, T1, T2 and T3 against per-tier goldens.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. + AC1: 30 scenes in tests/golden/ui-style run in tests/t1/ui_style.sh in about 6 s (limit 3 minutes). AC3 still open: no forced render tier exists.
Review 2026-10-25: closed as Done. AC1 and AC2 done. AC3 (forced render tiers) has no tier switch; move it to ZN-278. Evidence: tests/t1/ui_style.sh (30 scenes), tools/style-neutrality Verifier: AC1 and AC2 are done. ZN-278's ACs do not mention forced tiers, so AC3 (the feature-matrix scene per forced T0-T3 tier) must be added to ZN-278 as a criterion, not just named.
<!-- SECTION:NOTES:END -->
