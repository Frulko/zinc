---
id: ZN-693
title: instanceof is false once a caught error went through a parameter typed any
status: Backlog
assignee: []
created_date: '2026-10-10 20:17'
labels:
  - compiler
  - bug
  - size-S
dependencies: []
ordinal: 13900
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the pinball editor (ZN-649.04): `e instanceof MyError` is true on the catch variable itself and false once the caught value was passed to a function whose parameter is typed `any`, on the compiled program and with --interp. The 8-line reproduction is in the notes of ZN-649.04.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the reproduction prints true in both places, on the interpreter, the AOT and QuickJS (regression program in tests/golden/run)
- [ ] #2 the oracle accepts the program
<!-- AC:END -->
