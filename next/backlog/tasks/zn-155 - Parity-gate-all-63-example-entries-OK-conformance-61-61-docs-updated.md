---
id: ZN-155
title: 'Parity gate: all 63 example entries OK, conformance 61/61, docs updated'
status: Backlog
assignee: []
created_date: '2026-10-06 23:04'
updated_date: '2026-10-11 08:55'
labels:
  - examples
  - tests
  - size-S
milestone: m-15
dependencies:
  - ZN-151
  - ZN-152
  - ZN-153
  - ZN-154
  - ZN-139
  - ZN-140
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The closing gate of the parity plan: tests/examples.lst has no xfail, tests/conformance runs 61/61 on the interpreter and AOT, docs/reports/parity/ is re-run and the matrices are regenerated (01 to 03) showing no MISSING feature that the prototype supported, README of next/ rewritten for users.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the three audits re-run as scripts (tools/parity-audit) and report zero blocked examples and zero MISSING prototype features
- [ ] #2 RESUME.md and docs/reports/STATUS-next.md state the result with the commands to reproduce it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Handover (2026-10-11). Done: next/tools/parity-audit re-runs the three audits as one script (85 s): table A of 01 (each snippet on the prototype oracle and on zinc run), table C (one program per diagnostic row), table D (a probe per CLI command or flag), table E (an import of each module), tests/conformance (61 programs against their frozen .out), tests/examples.lst (02) and every plugin of plugins/ (03: listed by zinc plugins, its module imports). It writes docs/reports/parity/gate.md and exits 1 on any MISSING. Gate today (7f84eae1 + this commit): A 311 PASS / 3 PARTIAL / 4 MISSING (+8 rows the prototype itself refuses), C 41 / 3 / 4, D 27 PASS / 2 MISSING (+2 by decision: no JIT D13, no JS back end; +2 deferred: esp32 run, cross builds), E 29/29, F 60 PASS / 1 PARTIAL, examples 70/70, plugins 35/35. Fixed on the way, each with a test: a program importing only zinc:osc did not compile (the loop prelude it needs, tests/t0/osc.sh); a string constant only in code after a return made the program fail to load (the string class now emitted, tests/golden/run/dead_string); `f() === undefined` on a void call crashed the lowering (exit 139; folded, tests/golden/run/void_compare); 'abc'[1] (rewritten to charAt: '' past the end where JavaScript gives undefined, tests/golden/run/string_index); typeof SomeClass is 'function' (tests/golden/run/typeof_class); zinc run --target sim (and this machine's target) runs here (tests/t0/run.sh). Left, to make the gate pass (docs/reports/parity/gate.md lists them): A: console.table (needs the console.log text of a value as a string: the checker's inspect helpers), static accessors (`static get v()`), default values in destructuring patterns, `let s` without an initializer; C: `typeof X` in a type position, `readonly number[]`, `// @ts-ignore`, an exhaustive switch without a final return (Z0110 today); D: the commands zinc ui (check|code|import|pack|serve, the prototype's compiler/src/ui-tools.ts) and zinc compat (tests/compat/run.mjs). Worth fixing beyond the count (PARTIAL): `p.then(x => promise)` does not flatten (fetch().then(r => r.text()) yields a Promise; the checker's __then helper has no Promise-returning variant), console.log(-0) prints -0 (prototype 0), an i64 near 2^53 rounds otherwise, scroll_physics.tsx prints nothing. AC2 (docs/reports/STATUS-next.md, RESUME) once the gate passes. Next command: `next/tools/parity-audit` (then read docs/reports/parity/gate.md). Tests: T0 (atelier fixed in 8bf1d0f8; shared_headers fails on src/qjs/webenv.cpp from 0e032f0f, another session; tls known on this machine), quickjs, rc, aot, conformance, oracle_diff pass. usage: n/a
<!-- SECTION:NOTES:END -->
