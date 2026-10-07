---
id: ZN-260
title: >-
  UI style: Box-shadow: offset, blur, spread, colour, multiple, inset,
  `drop-shadow` as box approximation
status: Backlog
assignee: []
created_date: '2026-10-07 12:57'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-174
  - ZN-178
  - ZN-259
ordinal: 50600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-10). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `shadow-sm..xl` bit-exact with today.
- [ ] #2 Goldens of two-layer and inset shadows; GL analytic blur within tolerance.
- [ ] #3 T0: more than 2 layers or blur > 8 px degrade as specified (test) and inset drops with a log line.
<!-- AC:END -->
