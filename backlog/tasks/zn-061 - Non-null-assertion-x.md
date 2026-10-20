---
id: ZN-061
title: Non-null assertion x!
status: Done
assignee: []
created_date: '2026-10-06 22:48'
updated_date: '2026-10-06 23:49'
labels:
  - language
  - size-S
milestone: m-13
dependencies: []
ordinal: 40030
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Parse `x!` (postfix) and `x!.y`; the checker types it as the non-null type of x and lowers to a checked unwrap that traps with 'null reference' when null. Needed by plugins/process/native/process.sim.ts, plugins/script/index.ts:127, examples/boards/scrollphat/snake and examples/scripting/bench:78.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 fixtures: `x!` on T|null yields T and traps on null with exit 101; `x!` on a non-null type is accepted (like tsc)
- [x] #2 the four files above get past this construct
- [x] #3 oracle_diff reports no violation
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. N::NonNull node; checker types it as withoutNull; lowering reuses the checked downcast; QuickJS strip blanks the '!'. The four files now fail only on other constructs (package imports, regex literals).
<!-- SECTION:NOTES:END -->
