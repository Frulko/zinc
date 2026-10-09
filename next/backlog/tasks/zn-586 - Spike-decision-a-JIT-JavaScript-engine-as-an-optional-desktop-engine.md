---
id: ZN-586
title: 'Spike (decision): a JIT JavaScript engine as an optional desktop engine'
status: Backlog
assignee: []
created_date: '2026-10-09 08:12'
updated_date: '2026-10-09 09:29'
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
ordinal: 365270
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
