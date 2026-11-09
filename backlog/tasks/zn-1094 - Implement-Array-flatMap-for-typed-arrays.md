---
id: ZN-1094
title: Implement Array.flatMap for typed arrays
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 16:31'
labels:
  - language
  - frontend
  - size-S
milestone: m-32
dependencies: []
ordinal: 1012
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks ZN-1078.12 PathBar children menu. Minimal /tmp/zinc-flatmap-repro/main.ts: `const rows: string[][] = [['a'], ['b', 'c']]; console.log(rows.flatMap((row: string[]): string[] => row).join(','));` fails Z0106 on string[][]. Preserve ordinary application source, implement in the shared frontend/IR path and existing QuickJS semantics. Old ZN-060 described this surface but its implementation omitted it; compatibility reports still mark it missing.

Data sub-agent primary research: https://tc39.es/ecma262/multipage/indexed-collections.html#sec-array.prototype.flatmap and #sec-flattenintoarray: captured initial length, ascending existing indices, callback(value,index,source), flatten returned arrays exactly one level, empty result contributes nothing, scalar result contributes one when expressible by existing types, errors propagate, new result leaves input untouched unless callback mutates. Existing vendored implementation: third_party/quickjs-ng/quickjs.c JS_FlattenIntoArray and js_array_flatten, upstream https://github.com/quickjs-ng/quickjs/blob/master/quickjs.c. No dependency. Respect deliberate dense-array/type restrictions; record unsupported cases rather than silently changing semantics. Do not hand-code a PathBar workaround or special-case a kit type.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Typed array flatMap works generically on numbers, strings and records through the shared compiler and all three engines, including inference and the original nested string array
- [ ] #2 Exact regression covers one-level flattening, empty results, callback order/value/index/source, captured length and exception cleanup; existing supported dense-array and type boundaries remain explicit
- [ ] #3 Unchanged PathBar/Data source checks and a short original feature proof pass, with documented scope and proposed milestone checks
<!-- AC:END -->
