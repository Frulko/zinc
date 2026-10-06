---
id: ZN-067
title: >-
  Inference: array literals through generic arguments, callback parameter kinds,
  field types from module consts
status: Backlog
assignee: []
created_date: '2026-10-06 22:49'
labels:
  - language
  - checker
  - size-M
milestone: m-13
dependencies: []
ordinal: 40090
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Audit 02 RC10/RC11/RC13: `createSignal<i32[]>([1, 2])` and `id<i32[]>([...])` type the literal f64[]; `(i32, string) => void` is rejected where `(f64, string) => void` is expected (TypeScript parameter bivariance; numbers are one type in TS); a field initialised from a module const (`private fillVal = BLACK`) fails Z0109. Contextually type literals from the explicit type argument; accept machine-number kind differences in callback parameters with an inserted conversion thunk or an explicit documented rule (record the choice); infer field types from module-level const initialisers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 fixtures for each of the three; examples/zed-editor, esp32-2432s022, remote/viewer, webview/hybrid and canvas/sketch pass this step
- [ ] #2 documented rule for callback parameter kinds in docs/reports/zinc-next-design.md
<!-- AC:END -->
