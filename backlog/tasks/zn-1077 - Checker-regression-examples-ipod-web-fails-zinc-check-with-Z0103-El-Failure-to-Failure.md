---
id: ZN-1077
title: >-
  Checker regression: examples/ipod-web fails zinc check with Z0103 'El |
  Failure' to 'Failure'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 08:34'
labels:
  - checker
  - bug
  - size-S
dependencies: []
ordinal: 991000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by ZN-1049 on 2026-11-09: `zinc check examples/ipod-web` (and examples/ipod, which imports examples/ipod-web/src/services/subsonic.ts) fails with Z0103 Type non assignable 'El | Failure' vers 'Failure' at a meaningless place in lib/std/web.ts that changes with the entry point. Every iPod app session of the tests fails. Likely one of the checker commits of 2026-11-09: beb619f27 (cloned lambdas in field initialisers, unTdz narrowing), 0d6e694d8 (a field assigned in both branches) or 498f78a79 (widened records). A standalone copy of subsonic.ts's signatures does not reproduce it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/ipod-web and examples/ipod pass zinc check on develop
- [ ] #2 the smallest program that reproduces it is a T0 regression test, on the interpreter, AOT and QuickJS
- [ ] #3 the error points at the real source line
<!-- AC:END -->
