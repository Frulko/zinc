---
id: ZN-382
title: >-
  Layout: percent padding, margin, insets, gap and min/max; baseline alignment;
  display contents key
status: Backlog
assignee: []
created_date: '2026-10-08 19:00'
labels:
  - ui
  - layout
  - size-M
milestone: m-17
dependencies: []
ordinal: 142000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Gap from the conformance corpus (ZN-289): percent padding (3), margin (1), position (7), gap (9), min/max (9); alignItems / alignSelf 'baseline' (16); display 'contents' (9, the Contents layout prop exists). Add the keys and their mapping to Yoga; classic support where cheap, else documented as rn-only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 those cases run and pass in rn; the matrix in docs/reports/layout-conformance.md is regenerated
<!-- AC:END -->
