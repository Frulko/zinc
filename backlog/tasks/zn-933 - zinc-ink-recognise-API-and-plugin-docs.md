---
id: ZN-933
title: 'zinc:ink recognise API and plugin docs'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-01 12:12'
updated_date: '2026-11-01 13:25'
labels:
  - ink
  - size-S
milestone: m-29
dependencies:
  - ZN-932
ordinal: 627460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
recognise, recogniseAsync (worker thread), classes, priors, loadModel; section in docs/plugins/ink.md. This is the base of local handwriting recognition in Zinc. Design, scores and context: docs/reports/murdoku-eink-handwriting.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A headless test gives equal results on interpreter, AOT and QuickJS
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
recognise/recogniseAsync/loadModel/StrokeGrouper in plugins/ink/recognise.ts; scores 1/(1+(d/0.3)^2), MIN_SCORE 0.4, MIN_MARGIN 0.1 (the report said 0.15; fitted on held-out synthetic writers: 0.1 keeps 95% of marks, 0 wrong accepted, 2/56 scribbles accepted; 0.15 would reject 10%). loadModel takes a template file (the Stage A model); the .znm CNN is ZN-936. Engine gap found, not fixed: Map<string, number>.get of a missing key is null on the interpreter and AOT but undefined on QuickJS, so '!== null' is true there; recognise.ts uses has()+get(). tests/t0/ink_recognise.sh: equal output on the three engines.
<!-- SECTION:NOTES:END -->
