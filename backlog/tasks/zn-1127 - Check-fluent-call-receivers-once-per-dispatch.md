---
id: ZN-1127
title: Check fluent call receivers once per dispatch
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-12 10:47'
labels:
  - language
  - frontend
  - perf
  - size-M
milestone: m-7
dependencies: []
ordinal: 17504
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks the original ZN-1037 sender-roundtrip and ipod-web compilation: unchanged trackEl has about46 fluent calls and times out during compilation. A dependency-free Chain.next() repeated40 times also times out under a5-second check; XML import plus one .s passes. Research .logs/research-fluent-chain-m.txt identifies callExpr dynamic receiver probes checking expr(receiver), then normal Member fallback checking the same receiver again, recursively doubling prefix work. Reuse the freshly checked receiver only within the same call dispatch/member-resolution context; never install a global nodeType cache, split application chains or weaken flow checks. Scope shared checker and focused T0/fixtures/mapping/docs only; no RT/IR/ABI/HAL/host/UI/main edits. Original failures/sources live in .worktrees/1124-1125-boundaries/.logs/production1037-stage6 and sender-blocker.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An unchanged dependency-free40–64-link fluent chain checks within a short functional timeout and produces the expected output on interpreter, actual native AOT and QuickJS; ordinary and specialization-name fallback chains are covered.
- [ ] #2 Focused receiver/key/argument ordering, exactly-once effects, dynamic/optional calls, contextual callbacks and flow/private/arity/type-error controls retain correct behavior without cross-statement or cross-branch stale receiver facts.
- [ ] #3 Original ZN-1037 sender-roundtrip and atomic library consumer pass all three engines without caller chain splitting; after the minimal fix passes, one bounded original ipod-web check verifies the affected real compilation path without launching a daemon.
<!-- AC:END -->
