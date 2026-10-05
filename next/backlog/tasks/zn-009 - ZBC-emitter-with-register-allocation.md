---
id: ZN-009
title: ZBC emitter with register allocation
status: Backlog
assignee: []
created_date: '2026-10-05 14:21'
updated_date: '2026-10-05 14:22'
labels:
  - size-M
milestone: m-1
dependencies:
  - ZN-008
  - ZN-003
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
As a **Maintainer**, I want typed register bytecode with coalescing, so that the interpreter has no tag checks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `fib` and `mandelbrot` emit valid ZBC; a verifier checks every file before execution.
<!-- AC:END -->
