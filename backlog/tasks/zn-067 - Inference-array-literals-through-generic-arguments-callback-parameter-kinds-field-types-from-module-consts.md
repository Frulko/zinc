---
id: ZN-067
title: >-
  Inference: array literals through generic arguments, callback parameter kinds,
  field types from module consts
status: Done
assignee: []
created_date: '2026-10-06 22:49'
updated_date: '2026-10-07 00:44'
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
- [x] #1 fixtures for each of the three; examples/zed-editor, esp32-2432s022, remote/viewer, webview/hybrid and canvas/sketch pass this step
- [x] #2 documented rule for callback parameter kinds in docs/reports/zinc-next-design.md
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Explicit type arguments type array literals; callbacks may differ in machine number kinds through a generated converting thunk (rule in zinc-next-design.md section 5); a field takes the type of a module const (annotated, literal, alias or new Class). The five examples get past these three errors; they stop on other tasks (isNaN, Promise statics, zinc:process members).
<!-- SECTION:NOTES:END -->
