---
id: ZN-1109
title: Bind method receivers in default parameter expressions
status: Done
assignee: []
created_date: '2026-11-09 23:35'
updated_date: '2026-11-10 00:08'
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
- [x] #1 Default method parameter expressions read the correct instance receiver and prior parameter values without invalid IR; explicit supplied arguments and ordinary defaults preserve their contracts
- [x] #2 Focused regression proves distinct instances, once-only receiver/argument evaluation, omitted and explicit undefined, nested or callback use and cleanup on interpreter/AOT/QuickJS, with appropriate invalid-this negatives
- [x] #3 Original TerminalBuffer.text() and Tool panels model pass unchanged, with docs/changelog/provenance/limits and proposed checks recorded
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Method defaults now share defaultArgument with the existing parameter substitution map. The scoped guard restores prior parameters and the receiver for direct, virtual and named closure defaults; readThis is reused for property access, method calls and closure capture. All supplied arguments are evaluated before default expressions; defaults then fill in parameter order. Method declaration metadata lets the checker accept literal undefined only at a declared default slot, without treating literal null as omission or changing method signatures. A shadowed undefined binding is resolved as its value rather than the builtin literal. No runtime API/dependency, nullable-signature migration, new control wrapper or sentinel/body-default workaround.

Primary research: ECMAScript [[Call]] binds this before OrdinaryCallEvaluateBody and FunctionDeclarationInstantiation/default evaluation: https://tc39.es/ecma262/multipage/ordinary-and-exotic-objects-behaviours.html#sec-ecmascript-function-objects-call-thisargument-argumentslist and #sec-functiondeclarationinstantiation. Chosen reuse keeps the existing call-site default representation and ordinary method ABI; globally moving method defaults into nullable callee parameters would change signatures and boxing costs. Existing virtual default selection from the declared method remains unchanged; no broader override-policy claim.

Final candidate SHA256b96e6cb7b9266f84b13b0361a2cb600f0134fe620fec53855a28c98c46deb93e. Exact method_defaults PASS interpreter/native AOT/QuickJS, unchanged original six-line Buffer.text program PASS all3. Covers distinct instances, supplied zero, omitted/explicit undefined including before another supplied argument, shadowed undefined, prior parameters, nested receiver restoration, default closures capturing this, thrown defaults then another call, virtual receiver/default order, and repeated optional default expressions. Invalid global this stays Z0112 and literal null to number stays Z0103; mem allocs=frees/leaked0. Strict tsc original and fixture with assertion declarations PASS. Combined optional_collection all3 PASS; unchanged nested_defaults/defaults_pack callers pass interp. Existing dependency warnings remain outside edited sources; final checker rebuild emitted none.

Actual caller: panels worker ran original tests/t0/tool_panels.sh on this exact candidate with its source root; tool panels: ok, status0, all3. Original TerminalBuffer.text(last=this.lines.length-1) and FlameIndex.visible(lastDepth=this.levels.length) remain unchanged. Raw log .worktrees/1078-panels/.logs/tool-model-1109.log. The full original UI proof for1108 AC3 is still being completed by panels; do not claim it from the typecheck alone. Source/binary hashes and final raw results .logs/1109/provenance.json, final.log; no owned process remains. Usage: n/a (tools/usage). Proposed tests: longer nested/default callback churn and Pi/Mojave/Linux replay at an owner-selected milestone, minutes/memory unmeasured; broad suites, pixels, benchmarks and devices were not run.
<!-- SECTION:NOTES:END -->
