---
id: ZN-1100
title: Support nullable string keys in typed collections
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-09 21:18'
labels:
  - runtime
  - size-S
milestone: m-32
dependencies: []
ordinal: 1018
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while proving1097 constructor inference. Existing clean develop binary before1097 already traps on explicit const s:Set<string|null>=new Set<string|null>(['one',null]); console.log(s.size). Confirmed baseline and source at .worktrees/1096/.logs/1097/nullable-string-set.ts and nullable-string-baseline.log. Runtime mapGet/mapHas/mapSet/setAdd in src/rt/rt.h~594-620 reject null whenever KeyKind::Str even though the checker admits nullable string keys. This is a runtime key-contract gap, independent of inference; never rewrite application collections to avoid null. Verify shared hash/equality/delete paths and all three engines, not only remove a guard. Fresh sole core worker after the five-task1093/1096/1097/1098/1099 batch. Main has another session's rt.h/runtime lifecycle WIP: inspect its diff first, preserve every hunk, prefer a non-overlapping minimal shared operation fix; do not incorporate external WIP into the clean build. Worktree only, load-aware build/short proof and exact T0, no suite. Short primary ECMAScript collection/Set research required before implementation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Nullable string Set elements and Map keys support construction, add/set, has/get, delete and iteration with null/undefined semantics matching the typed representation; ordinary string equality stays by value
- [ ] #2 A small regression covers inferred and explicit constructors, duplicate nullish keys, empty vs null strings, value replacement, deletion, exception/reference lifetime and interpreter/AOT/QuickJS behavior
- [ ] #3 Original two-line baseline repro succeeds; constructor-inference regression remains green; changelog, exact proof and remaining boundaries are recorded
<!-- AC:END -->
