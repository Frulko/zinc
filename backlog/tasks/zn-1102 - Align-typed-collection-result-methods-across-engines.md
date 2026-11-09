---
id: ZN-1102
title: Align typed collection result methods across engines
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 21:34'
labels:
  - runtime
  - qjs
  - size-M
milestone: m-32
dependencies: []
ordinal: 1020
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by1100 exact regression: lib/zinc.d.ts promises Map/Set values()/keys() arrays, while raw QuickJS returns native iterators so values().length is undefined. Minimal .worktrees/1100/.logs/1100/iterator-array.ts retained; join accidentally works only because modern iterator helpers exist. Current nullable-key feature is independently proved with standard for-of; no application rewrite was used. Confirm all public result signatures and recorded language/engine boundaries before choosing a fix. Preserve documented array clients and arbitrary unrelated methods; avoid blindly monkey-patching global native iterators and breaking third-party or embedded zinc:script JavaScript. Reuse typed lowering/QuickJS bridges and existing builtin metadata when possible, no component-specific adapter. New sole core batch after1100, along with1101 QuickJS cwd; one commit per task. Short primary research should compare ECMAScript Map/Set iterator contracts and Zinc's deliberate standard-library choices. No suite, exact T0 and small actual program only.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Public typed Map/Set keys, values and entries results match their documented Zinc types and observable behavior across interpreter, AOT and QuickJS, preserving insertion order and snapshot semantics
- [ ] #2 A focused regression covers array length/index/map/join use where promised, standard for-of, empty collections, nullable contents and mutation after obtaining the result; arbitrary user methods with those names remain untouched
- [ ] #3 The minimal values().length repro passes on all three engines, existing collection_infer/nullable_keys stay green, and actual compatibility boundaries for unsupported JavaScript or embedded Script are explicitly documented without a global native-JS behavior regression
<!-- AC:END -->
