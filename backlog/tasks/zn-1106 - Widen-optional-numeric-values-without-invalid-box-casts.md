---
id: ZN-1106
title: Widen optional numeric values without invalid box casts
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 22:40'
labels:
  - ir
  - frontend
  - size-M
milestone: m-32
dependencies: []
ordinal: 1024
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while proving1102 optional collection-result chains. Original valid program function maybe(m:Map<string,string>|null):number|undefined{return m?.values().length;} fails interpreter IR verification with refcast Box<i32>→Box<f64> @main bb13. Root clean pre1102 binary SHA1d4b213a4d72e5693b03c4aaaaa7b5c6dd09ccad78886facfcc33edeb690e0f1 confirms baseline exit3. Repro .worktrees/1101/.logs/1102/optional-length-original.ts and optional-length-baseline.log. i32|undefined annotation is a separate valid exact-public-type test, not a fix for this accepted numeric-widening program; no application workaround. Inspect generic nullable numeric boxing/coercion and reuse established scalar conversion rules, not a values/length-specific special case or unsafe reinterpretation. Preserve D18 typed nullish representation, signedness/precision/profile constraints and ownership when reboxing. Fresh sole core worker NEXT after current five-task1101/1104/1103/1102/1105 batch; do not append as sixth. Main runtime array/LVGL/Fenwick WIP stays untouched; prefer isolated frontend/IR fix. Short primary implementation research before task, then one target build/exact regression + unchanged original program, no suite/benchmark.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Nullable numeric coercions apply the existing allowed widening before or while boxing; optional i32 length can return number|undefined without an invalid Box<i32>→Box<f64> reference cast, preserving nullish representation and ordinary numeric rules
- [ ] #2 Focused T0 covers absent/present and zero/negative/large integer values through returns, locals, parameters and generic/callback paths across interpreter/AOT/QuickJS, with meaningful IR/lifetime checks and invalid narrowing negatives
- [ ] #3 The original optional Map length repro succeeds unchanged; collection_results and affected Code/UI consumers remain coherent, with docs/changelog/limits and proposed milestone checks recorded
<!-- AC:END -->
