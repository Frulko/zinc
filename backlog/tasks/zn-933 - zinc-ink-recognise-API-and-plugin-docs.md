---
id: ZN-933
title: 'zinc:ink recognise API and plugin docs'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-01 12:12'
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
- [ ] #1 A headless test gives equal results on interpreter, AOT and QuickJS
<!-- AC:END -->
