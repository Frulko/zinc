---
id: ZN-1002
title: >-
  Full TypeScript parity: support every construct rejected today, proven with
  TypeScript's own tests
status: Backlog
assignee: []
created_date: '2026-11-07 16:12'
labels:
  - parked
  - language
  - size-L
milestone: m-13
dependencies: []
ordinal: 990000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request (2026-11-07): support everything the engine rejects today (docs/guide/02-language.md, "What is rejected, and why"), aiming at 100% parity with TypeScript, proven with TypeScript's own tests and the tsc CLI. **Parked by the owner: not to be worked until the owner lifts `parked`.** Too big for one session: split it when it starts (`New-task: split ZN-n`).

## The rule of acceptance: tsc decides

Zinc accepts exactly what `tsc --strict` 7 accepts (the oracle `tools/oracle`, `typescript` 7.0.2 in package.json), and runs it with JavaScript's semantics on the three engines (interpreter, AOT, QuickJS). Where tsc itself refuses a construct, Zinc refuses it with tsc's reason (a Z code naming the TS one), not a subset rule:

| code | today | target |
| --- | --- | --- |
| Z1001 `var` | rejected | supported: function scope and hoisting, desugared in the frontend; a top-level `var` of a script is a property of the global object |
| Z1002 `arguments` | rejected | supported: an unmapped array-like (modules are strict code), built only in a function that names it |
| Z1003 `eval`, `new Function` | rejected | supported: a run-time compiler (the frontend and ZBC in the program when it uses them); direct eval sees the caller's scope (its locals live in an environment record, as captured locals do), indirect eval the global scope |
| Z1005 `with` | rejected | refused as tsc does in a `.ts` module (TS2410/TS1101, strict code); supported in a sloppy `.js` script |
| Z1007 `delete` | rejected | supported on optional fields, index signatures, `Dyn` and arrays; a required field refused as tsc does (TS2790) |
| Z1009 dynamic `import()` | rejected | supported: a literal specifier is a module known at compile time, initialised lazily; a computed one loads through the run-time compiler or the project's module map |
| Z1010 prototype mutation | rejected | supported: a class whose prototype is written or read (`A.prototype`, `__proto__`, `Object.setPrototypeOf`) gets dynamic shapes with inline caches (ZN-025's `Dyn`); other classes keep their fixed layout |
| Z1011 holes | rejected | supported: a holey element kind (as V8's), only for arrays that get a hole; packed arrays unchanged |
| Z1015 `globalThis` | rejected | supported: a global object, typed as tsc types it (`declare global`, `var` declarations) |
| Z9026 `in` on a typed value | rejected | supported with tsc's narrowing; answered at compile time on a closed class, at run time on a structural type or union |
| Z1006 `any` in a strict profile | rejected | supported through `Dyn`; the profile says what it costs, not that it is refused |
| Z4001 no fixed-point form (`--profile ps1`) | rejected | supported through a soft-float path on that profile; the diagnostic becomes a performance note |
| Z0006/Z0007 `class=`, lowercase JSX tags | rejected | **kept**: owner rule of 2026-10-16 (AGENTS.md "Real JSX and TSX"), not a gap |
| Z0119 module not found | rejected | **kept**: tsc refuses it too (TS2307) |

Pay only for what you use: a program that uses none of these features compiles to the same IR and ZBC as today, and the typed fast path keeps its speed.

## How to use TypeScript's own tests (the harness to build)

- **Data**: pin the cases of microsoft/TypeScript at the commit that matches tsc 7.0.2 (the `_submodules/TypeScript` commit of microsoft/typescript-go): `tests/cases/conformance/**` and `tests/cases/compiler/**` (about 12,000 cases, Apache-2.0) and `tests/baselines/reference/*.errors.txt`, as a sparse-checkout tarball under `tests/data/` like the test262 subset, with the licence.
- **Reader**: each case carries `// @option: value` lines (`@target`, `@strict`, `@module`, `@jsx`, `@lib`...) and `// @filename:` sections that cut it into several files. The tool writes them out, maps the options, and marks a case `unsupported` with a named reason when an option is outside Zinc's model (ES5 target, CommonJS or AMD emit, declaration emit only, `@noImplicitAny false`...): the exclusion list is short, explicit and reviewed.
- **Three checks per case**:
  1. Acceptance: `tools/oracle` (the tsc CLI) accepts or refuses the case; `zinc check` must give the same answer, and on a refusal the same lines (the `.errors.txt` baseline gives TS codes and positions; Z diagnostics carry the TS code they stand for).
  2. Semantics: a case tsc accepts and that has a runnable body is emitted by `tsc` to ES2022, run under Node, and its output compared with `zinc run` on the interpreter, AOT and `--engine quickjs`.
  3. Types (later, optional): tsc's `.types` baselines against a dump of Zinc's checker types.
- **Report and gate**: `tools/ts-conformance` writes `docs/reports/zinc-next-ts-conformance.md` (pass, fail, unsupported per directory: `types/`, `expressions/`, `classes/`, `es6/`...) and a baseline JSON; a T2 test fails when a passing case starts to fail, as `tests/t2/compat.sh` does for test262. The goal is 100% of the supported cases; every unsupported one has its reason.
- **test262 alongside**: the typed engine `next` reaches what QuickJS reaches on the pinned subset (today 1739 against 2024 of 2113, "unsupported 272" mostly these rejections, `docs/reports/zinc-next-compat.md`); then the subset grows to the full `test/language` and `test/built-ins`.
- These runs are long: they run at the milestones the owner chooses (AGENTS.md "Move fast"), never at the end of a task.

## Order of work (to split into subtasks)

1. The harness and its first report, so every following step is measured.
2. Decision record (RULES §4) for the dynamic object model and the run-time compiler: what lives in the program, the cost on each profile.
3. The frontend-only constructs: `var`, `arguments`, holes, `in`, `delete`, `globalThis`.
4. The object model: prototype mutation, `Object.setPrototypeOf`, `__proto__`.
5. The run-time compiler: `eval`, `new Function`, computed dynamic `import()`; `with` in scripts.
6. Profiles: `any` in strict profiles, Z4001 on ps1.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tools/ts-conformance runs the pinned microsoft/TypeScript cases (conformance and compiler) against tools/oracle and zinc check, and runs accepted cases on the three engines against the tsc-emitted JavaScript under Node; it writes docs/reports/zinc-next-ts-conformance.md with per-directory numbers and a reasoned exclusion list
- [ ] #2 a T2 test fails when a passing TypeScript case or test262 case starts to fail
- [ ] #3 a decision record scores the dynamic object model and the run-time compiler (RULES section 4) and states the cost per profile
- [ ] #4 var, arguments, eval, new Function, delete, dynamic import(), prototype mutation, holes, globalThis and in compile and run with JavaScript semantics on the interpreter, AOT and QuickJS; Z1001, Z1002, Z1003, Z1007, Z1009, Z1010, Z1011, Z1015 and Z9026 remain only where tsc refuses the same code, with the TS code named
- [ ] #5 with is refused in .ts modules as tsc refuses it and runs in sloppy .js scripts; any is accepted in every profile; Z4001 becomes a performance note on ps1
- [ ] #6 the corpus compiles to the same IR and ZBC as before for programs that use none of these features, and the M4 kernels keep their speed
- [ ] #7 test262 next reaches at least next-qjs on the pinned subset, and 100% of the supported TypeScript cases pass
- [ ] #8 docs/guide/02-language.md, zinc explain and CHANGELOG.md describe what is now supported
<!-- AC:END -->
