---
id: ZN-257
title: >-
  UI style: Border model: dashed/dotted, per-side colour, per-corner radius,
  border in layout (`box-border-layout`)
status: Backlog
assignee: []
created_date: '2026-10-07 12:56'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-251
  - ZN-174
ordinal: 50570
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-08). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Goldens: dashed, dotted, four colours, four radii, on SW f32 and GL within tier tolerance.
- [ ] #2 esp32 profile: dashed becomes solid and radii the largest corner, with one log line (test).
- [ ] #3 Presets `border`, `border-2`, `rounded-*` bit-exact with the old path.
<!-- AC:END -->
