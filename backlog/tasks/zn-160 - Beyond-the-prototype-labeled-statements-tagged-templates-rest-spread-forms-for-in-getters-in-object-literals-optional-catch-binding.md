---
id: ZN-160
title: >-
  Beyond the prototype: labeled statements, tagged templates, rest/spread forms,
  for-in, getters in object literals, optional catch binding
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-06 23:05'
updated_date: '2026-10-11 16:05'
labels:
  - language
  - size-M
milestone: m-7
dependencies:
  - ZN-155
ordinal: 59000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The forms the prototype also rejects (audit 01 table B): implement in the parser and desugarer with a fixture each, keeping the typed fast paths unaffected.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 fixtures equal Node's output for each form
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-11 (parallel worktree agent). One fixture per form in tests/golden/run, expected output from Node (`node --experimental-transform-types`), identical on the interpreter, the AOT (tools/diff-matrix: 7 programs, 0 with a difference) and --engine quickjs; all accepted by the tsc oracle.

Forms:
- Labeled statements (labels.ts): Labeled node; `break label` / `continue label` on every loop kind, a labeled block, through switch and finally (cleanups run); the checker refuses an unknown label (Z0101) and a continue to a non-loop label (Z0112) (errors/label_targets.ts). Z9011 retired (registry, docs/diagnostics.md, fixture). QuickJS-ng only finds the inner label of a doubly-labeled loop for `continue` (upstream bug): the fixture continues to the inner one.
- Rest parameters and spread arguments (rest_spread.ts): the function type has a `rest` flag; a call packs the arguments from the rest parameter on into one array literal (functions, methods, constructors, arrows, generic functions); a tuple variable spreads into fixed parameters; Math.max/min(...a) and a.push(...b) through generated loops. lib/zinc.d.ts: push(...items), String.raw, TemplateStringsArray extends Array<string> (std_surface exceptions for String.raw and Array.push, with reasons).
- Array patterns (destructure_rest.ts): `...rest` element (Array.slice) and defaults `[a = 1]` (missing or undefined element), in declarations, assignments, parameters, for...of.
- Tagged templates (tagged_templates.ts): the parser makes tag`a${x}b` the call tag(['a', 'b'], x) with the cooked strings; TemplateStringsArray is string[]; String.raw`...` is the template with its backslashes doubled.
- for...in (for_in.ts): for...of over a generated list of the keys: own fields of the static object type (inherited first, an optional one when set), array indices, __dynKeys for a Dyn (indices first, then insertion order). A string is refused like TypeScript (errors/for_in_string.ts).
- Getters, setters and this-methods in object literals (object_accessors.ts): the literal becomes an instance of a class generated for it (data properties passed to its constructor, members keep their parameters, types and bodies); a member reading a variable of the enclosing function is refused (errors/object_accessor_capture.ts).
- Optional catch binding (catch_optional.ts): already worked; fixture added (plain, function with finally, async).

Typed fast paths: no change for programs without the forms (IR goldens of the kernels and feature programs unchanged: tests/t0/ir.sh passes).
Tests: t0 run, checker, parser, lexer, diagnostics, std_surface, tdz, modules, ir, irformat, zbc, aot, qjs, corpus, rc_refcast, rc_lend, rc_borrow, rejections, syntax_pack, dyn_function, non_null, jsx; t1 conformance, oracle_diff (263 files, 241 agree, 22 stricter, 0 violations), quickjs, aot, rc. Not run: examples_all, T2 compat (test262 may now pass more labeled-statement tests: baseline refresh), the parity gate (section C rows labeled/rest/spread become PARTIAL: zinc accepts what the prototype refuses), rt (needs build/ops_test, not built here).

Decisions (for a record): (1) rest parameters = array parameters with a rest flag on the function type, packed at the call site by the checker: no IR/VM/AOT change. (2) tagged templates desugared by the parser, TemplateStringsArray = string[]; `.raw` unsupported. (3) for...in = for...of over keys from the static type (closed world) or __dynKeys. (4) object literals with accessors or this-methods = instances of a generated class (reuses getter/setter dispatch and `this`), not records with accessor members: costs the printed class name and closures in members.

Later lines:
- ZN-160: `s.raw` in a tag function is not supported on the typed engines (TemplateStringsArray is string[]); String.raw only as a tag.
- ZN-160: an object literal with accessors prints as its generated class (`__object0 { n: 2 }`, Node: `{ n: 2, v: [Getter] }`); for...in, JSON.stringify and {...o} leave its accessors out.
- ZN-160: getters and methods of object literals cannot read variables of the function around them (Z0005): needs methods that carry a closure.
- ZN-160: for...in lists the static type's fields: a subclass instance seen through its base type lists the base's fields, a typed object inside a Dyn lists none, parameter properties come before declared fields (Node: after).
- ZN-160: labels around await or yield in async functions and generators are refused (desugar T()); continue/break to a label could map to the rewritten loop's lambdas.
- ZN-160: spreads still refused: console.log(...a), push with several arguments, a tuple spread of an expression that is not a variable or property, a rest element of a tuple value.
- ZN-160 (bug found, not fixed): the lowering does not collect a function or class declared inside a lambda body or a nested block (collectFunctions walks function and method statement lists only): `const f = (): number => { function g(): number { return 1; } return g(); }` fails with "instruction ret of @lambda0:f uses a missing value"; a class with a getter inside an IIFE fails with "class P has no implementation of .v".
- ZN-160: QuickJS-ng: `a: b: for (...) { continue a; }` is a SyntaxError (break/continue label not found); report upstream or patch.
- ZN-160: regenerate docs/reports/parity/gate.md (section C) and refresh the compat baseline at the milestone.
<!-- SECTION:NOTES:END -->
