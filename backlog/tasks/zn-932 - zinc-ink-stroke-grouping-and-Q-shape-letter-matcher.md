---
id: ZN-932
title: 'zinc:ink stroke grouping and $Q shape/letter matcher'
status: Backlog
assignee: []
created_date: '2026-11-01 12:11'
labels:
  - ink
  - size-M
milestone: m-29
dependencies:
  - ZN-931
ordinal: 626460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
StrokeGrouper, resample/normalise, a $Q matcher in C++ with a TS reference, templates for circle, X, tick, A-E, V. Design, scores and context: docs/reports/murdoku-eink-handwriting.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 T0 test on the committed dataset: >= 95% letters, >= 98% shapes, under 5 ms per group on interpreter and AOT
- [ ] #2 TS and C++ results agree
<!-- AC:END -->
