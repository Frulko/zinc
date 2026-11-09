---
id: ZN-1109
title: Bind method receivers in default parameter expressions
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 23:35'
labels:
  - frontend
  - ir
  - size-M
milestone: m-32
dependencies: []
ordinal: 1027
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks ZN-1078.14 TerminalBuffer.text() and its exact model test. Six-line original repro .logs/blockers/default-this/default-this-method.ts: class Buffer { lines:string[]=["one","two"]; text(last:number=this.lines.length-1):string{return this.lines[last];}} const buffer=new Buffer(); console.log(buffer.text());. Clean da7ca0360 SHA25685f6d02a26948c1755090b0c06b3a926cad5cefa6df1799ce01d737a13e28f68 fails after RC with @main bb0 inst3 field access on a non-ref. Another larger model reports non-scalar const; minimize the shared receiver/default binding path and fix generically. Never rewrite original method to use a sentinel/body default or a caller-computed value. Reuse existing default-parameter evaluation and method receiver ownership; preserve argument order, exactly-once receiver evaluation, omitted/explicit undefined behavior, nested calls and closures, plus ordinary function defaults. Primary research 2026-11-10: ECMAScript [[Call]] binds this before FunctionDeclarationInstantiation/default evaluation: https://tc39.es/ecma262/multipage/ordinary-and-exotic-objects-behaviours.html#sec-ecmascript-function-objects-call-thisargument-argumentslist and #sec-functiondeclarationinstantiation. Inspect parser/check/lowering existing method default handling and strict tsc. Fresh sole core worker chain1108 then1109, no core edits by panels worker. Avoid main external runtime/ui.ts/LVGL WIP. No suites; one target build, exact T0/all3 and unchanged original Tool caller.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Default method parameter expressions read the correct instance receiver and prior parameter values without invalid IR; explicit supplied arguments and ordinary defaults preserve their contracts
- [ ] #2 Focused regression proves distinct instances, once-only receiver/argument evaluation, omitted and explicit undefined, nested or callback use and cleanup on interpreter/AOT/QuickJS, with appropriate invalid-this negatives
- [ ] #3 Original TerminalBuffer.text() and Tool panels model pass unchanged, with docs/changelog/provenance/limits and proposed checks recorded
<!-- AC:END -->
