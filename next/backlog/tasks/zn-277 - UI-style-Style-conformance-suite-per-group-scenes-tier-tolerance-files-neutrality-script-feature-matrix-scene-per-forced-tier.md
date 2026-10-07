---
id: ZN-277
title: >-
  UI style: Style conformance suite: per-group scenes, tier tolerance files,
  neutrality script, feature-matrix scene per forced tier
status: Backlog
assignee: []
created_date: '2026-10-07 12:58'
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
- [ ] #2 A `tools/style-neutrality` script runs the proto compare and fails on any manifest or `known` row change.
- [ ] #3 The B10 feature-matrix scene renders at forced T0, T1, T2 and T3 against per-tier goldens.
<!-- AC:END -->
