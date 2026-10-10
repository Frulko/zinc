---
id: ZN-620
title: 'App entry without the CLI: static engine library for embedders'
status: Backlog
assignee: []
created_date: '2026-10-10 14:03'
labels:
  - mobile
  - size-M
milestone: m-26
dependencies: []
ordinal: 385290
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A library target with one entry (`zn_app_main`): AOT program or bundled `.zapp`, runtime, host, plugins registered statically; no `src/tc`, no `src/frontend`, no `dlopen`, no `fork` (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 on macOS, hello and `examples/rn-showcase` linked against it print and draw what `zinc run` does (existing goldens)
- [ ] #2 `nm` shows no `dlopen`, `fork` or `execv` reference
- [ ] #3 a T0 test
<!-- AC:END -->
