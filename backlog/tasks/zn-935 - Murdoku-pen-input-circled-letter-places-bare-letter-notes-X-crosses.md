---
id: ZN-935
title: 'Murdoku pen input: circled letter places, bare letter notes, X crosses'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-01 12:12'
labels:
  - demo
  - ink
  - size-M
milestone: m-29
dependencies:
  - ZN-927
  - ZN-933
  - ZN-934
ordinal: 629460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Strokes are grouped and attributed to cells; circled letter = place, bare letter = note, X = cross, unknown stays as ink; the typeset glyph replaces the ink; two-finger tap undoes. Only the existing place, toggleNote and toggleCross actions are emitted so deduction.ts stays the rule source. Design, scores and context: docs/reports/murdoku-eink-handwriting.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A scripted pen session (stroke JSON replay) ends in the expected state on the Mac
<!-- AC:END -->
