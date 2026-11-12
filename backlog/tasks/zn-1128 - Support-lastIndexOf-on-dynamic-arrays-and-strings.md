---
id: ZN-1128
title: Support lastIndexOf on dynamic arrays and strings
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-12 12:17'
labels:
  - language
  - frontend
  - size-S
milestone: m-7
dependencies: []
ordinal: 17501
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks the original ZN-1039 counter-rename implementation: Doc.renameName validates a unique name with items.indexOf(old) and items.lastIndexOf(old), where items is the existing any-valued document list. The checker accepts the call, but interpreter execution throws TypeError: lastIndexOf is not a function. Minimal unchanged failure: const values: any = ['hits', 'other', 'hits']; console.log(values.lastIndexOf('hits')); expected 2. Authentic source/logs/snapshots: .worktrees/1039-counter-scores/.logs/proof/last-index.ts, stage-gap1/interp.log and stage-doc1/interp.log. Do not replace the application operation with a loop or cast workaround. Existing typed-array lastIndexOf and Dyn indexOf/string helpers provide the semantic implementation boundary; audit frontend dynamic method dispatch and prelude before touching shared runtime. Owner RT/HAL/UI/main work is held and must remain untouched.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The unchanged dynamic-array lastIndexOf failure prints 2 on interpreter, actual native AOT and QuickJS, with the original production counter-rename caller working unchanged.
- [x] #2 A focused regression covers dynamic arrays and strings, omitted and supported explicit starting positions, misses, duplicate values and strict identity; existing typed search behavior and current dynamic method callers remain coherent.
- [x] #3 The change stays in the shared frontend/Dyn implementation with a small T0 regression, affected mapping and module notes; no application workaround or owner-held RT/HAL/UI/main edit.
<!-- AC:END -->

## Implementation Notes

The shared frontend now recognizes dynamic `lastIndexOf`, preserves whether the position was omitted before the optional-argument normalization pass, and dispatches to one Dyn array/string helper. Null receiver lookup precedes argument effects; arguments including extras evaluate once in order. Arrays normalize positions in f64 before the bounded i32 index and use existing strict identity. Strings keep their separate NaN/default rules and existing UTF-16 search; Symbol needles/positions throw where conversion requires it. No runtime, application or owner-held module changed. Existing typed lowering and its i32 explicit-position profile remain unchanged.

Primary delegated research: `.worktrees/1039-counter-scores/.logs/research-lastindex-n.txt`; ECMAScript [Array.lastIndexOf](https://tc39.es/ecma262/multipage/indexed-collections.html#sec-array.prototype.lastindexof) and [String.lastIndexOf](https://tc39.es/ecma262/multipage/text-processing.html#sec-string.prototype.lastindexof). Reused Dyn strict equality, conversions and native string search; no dependency needed. Module note: `docs/reports/zinc-next-dyn-lastindex.md`.

Proof in worker `.logs/stage-proof5/`: focused regression and immutable original production Doc rename fixture each check, interpreter, QuickJS and actual native AOT PASS. Original seven production sources and three builtin inputs verified against the source worker's manifest; no cast, loop or caller workaround. Tests cover omission/undefined/NaN, signed/fractional/infinite/large positions, duplicate/missing/empty values, object/Symbol identity, NaN and signed zero, string coercion, null receiver and argument effects, ignored extras, typed-array controls and adjacent dynamic searches. `.logs/stage-t0/run.log`: exact `tests/run --only dyn_lastindex` PASS. `.logs/stage-literal/`: unchanged original minimal failure prints `2` on all three engines. Actual native app/key/inputs/plugin info/fallback files retained; the final compiler, three modules and every archive including nested SDL are frozen. No fallback counts as native.

Authentic earlier failures remain: stage-proof1/2 detected the optional pass dropping explicit undefined; stage-proof3 correctly rejected Doc's interpreter fallback because the first compiler snapshot omitted nested SDL. Corrected complete snapshot stage-proof4 passed actual native; stage-proof5 adds Symbol/coercion controls and is final. The stage-proof3 mini executable was not frozen before its shared cache was replaced; its logs/compiler remain, while stage-proof4/5 retain their exact native artifacts. Builds emit only the existing duplicate-library linker warning; no new compiler warning. No speed or memory claim. `usage: n/a`.

Limits: existing dense arrays have no separate missing-slot representation; no sparse-array implementation or broader conversion/typed-profile redesign was added. Proposed later line: ZN-1128: audit typed-array lastIndexOf's existing i32/sentinel normalization for explicit undefined and non-integer/non-finite positions, independently of dynamic dispatch.

## Proposed tests

- Owner-selected adjacent dynamic method and optional-chain regressions (`dyn_function`, `open_record_methods`, `dyn_callback`), seconds to tens of seconds, memory unmeasured; no broader suite run here.
- Cross-platform compiler/package milestone for this frontend helper; duration and memory unmeasured, not run.
