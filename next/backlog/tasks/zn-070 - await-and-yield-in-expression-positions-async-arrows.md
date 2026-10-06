---
id: ZN-070
title: await and yield in expression positions; async arrows
status: Backlog
assignee: []
created_date: '2026-10-06 22:50'
labels:
  - language
  - async
  - size-M
milestone: m-13
dependencies:
  - ZN-062
ordinal: 40120
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
desugar.cpp supports await only as `await e;`, `x = await e;`, `const x = await e;`, `return await e;`. Hoist awaits (and yields) out of call arguments, template literals, binary and conditional operands, conditions, for-of heads and array/object literals into temporaries, preserving left-to-right evaluation order and short-circuit semantics (`a && await b` keeps b conditional). Async arrow functions use the same rewrite.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 fixtures: await in arguments, templates, operands, conditions (if/while/for), for-of heads, short-circuit, object literals; evaluation order test with side effects equals Node's
- [ ] #2 examples/process/cli, camera/cli, scripting/*, lib/std/web.ts and fetch.ts pass this step
<!-- AC:END -->
