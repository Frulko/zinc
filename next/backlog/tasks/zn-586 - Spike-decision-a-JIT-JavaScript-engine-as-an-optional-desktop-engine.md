---
id: ZN-586
title: 'Spike (decision): a JIT JavaScript engine as an optional desktop engine'
status: Backlog
assignee: []
created_date: '2026-10-09 08:12'
updated_date: '2026-10-12 09:46'
labels:
  - games
  - js
  - decision
  - size-M
milestone: m-22
dependencies:
  - ZN-577
  - ZN-578
  - ZN-579
  - ZN-580
ordinal: 112000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
QuickJS runs game-library code 20-40x slower than V8 (60x on a raw sprite loop), which sets the compatibility tier's ceiling. Run the four demos and the physics/tween libraries on JavaScriptCore (system framework on macOS) behind the same host table and web environment; measure gain, size, start-up and W^X/entitlement constraints; weigh it against the AOT route of ZN-562/ZN-563 (zinc:gl, three subset on the GPU). Conflicts with decisions D3, D13 and D36: an owner decision. (From docs/reports/games/js-game-libraries.md.)

Decision D44 (docs/reports/zinc-next-decisions.md, docs/reports/quickjs-aot-jit-and-ffi.md) scored this option (a JIT engine on desktop) 32 against 40 for fixing the boundary and native accelerators first; it stays this task's question, after those.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 numbers for the four demos on QuickJS and on the JIT engine
- [ ] #2 a decision recorded against D3, D13 and D36 with a revisit condition
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-12, answered by D110 (owner: "we want a fast QuickJS or our VM fast"): no third-party JIT engine, this task is not to be worked; the next backlog review removes it. What was measured before the answer (docs/reports/zinc-next-perf.md, same day): the bench/qjs workloads on the system JavaScriptCore run 6 to 32x faster than on QuickJS with its JIT and 1.2 to 2.1x without; the framework embedded in a program has no JIT unless the executable carries com.apple.security.cs.allow-jit (bench/qjs/jsc-host.c). The four demos were not run on it.
<!-- SECTION:NOTES:END -->
