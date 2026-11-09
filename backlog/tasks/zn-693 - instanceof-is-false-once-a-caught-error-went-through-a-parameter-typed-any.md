---
id: ZN-693
title: instanceof is false once a caught error went through a parameter typed any
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 20:17'
updated_date: '2026-11-09 01:38'
labels:
  - compiler
  - bug
  - size-S
dependencies: []
ordinal: 9400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the pinball editor (ZN-649.04): `e instanceof MyError` is true on the catch variable itself and false once the caught value was passed to a function whose parameter is typed `any`, on the compiled program and with --interp. The 8-line reproduction is in the notes of ZN-649.04.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the reproduction prints true in both places, on the interpreter, the AOT and QuickJS (regression program in tests/golden/run)
- [x] #2 the oracle accepts the program
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research (sonnet sub-agent, 2026-11-09): instanceof is a prototype-chain walk (Symbol.hasInstance) in JS engines; typed AOT compilers (AssemblyScript rtid ranges, MakeCode vtables) check a class id in the object header, so boxing into a dynamic value must keep the same object, not copy it. Known pitfall elsewhere: ES5-target Error subclasses lose their prototype (Object.setPrototypeOf(this, new.target.prototype)), https://github.com/Microsoft/TypeScript/issues/12123 ; cross-realm errors fail instanceof (MDN Error.isError).

Finding: the defect no longer reproduces on develop (022db5d94). The 8-line reproduction of ZN-649.04, a multi-module one shaped as the editor's Doc.apply (TableError imported, thrown in another module, caught in a method, passed to functions typed any and unknown, an arrow, an array, an object field, a rejected promise) all print true on the interpreter, the AOT (--native) and QuickJS, as Node does. No commit names a fix: it went away with the any/boxing work between 2026-10-10 and now. The regression program pins it.

Done: tests/golden/run/instanceof_any.ts and .out (interpreter output, identical to --native, --engine quickjs and Node 24 --experimental-strip-types); the oracle (tsc 7 with lib/zinc.d.ts, the command of tools/oracle) accepts it (rc 0). tests/t0/run.sh and the T1 suites that glob tests/golden/run pick it up.

Proposed tests:
- tests/run --only run (T0 over all run goldens): the new golden on the interpreter; ~30 s, ~200 MB.
- tests/run --only quickjs and tests/run --only oracle_diff (T1): QuickJS and the oracle over the run goldens; ~2 min each, ~300 MB.
<!-- SECTION:NOTES:END -->
