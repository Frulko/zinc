---
id: ZN-1100
title: Support nullable string keys in typed collections
status: Done
assignee: []
created_date: '2026-11-09 21:18'
updated_date: '2026-11-09 21:30'
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
- [x] #1 Nullable string Set elements and Map keys support construction, add/set, has/get, delete and iteration with null/undefined semantics matching the typed representation; ordinary string equality stays by value
- [x] #2 A small regression covers inferred and explicit constructors, duplicate nullish keys, empty vs null strings, value replacement, deletion, exception/reference lifetime and interpreter/AOT/QuickJS behavior
- [x] #3 Original two-line baseline repro succeeds; constructor-inference regression remains green; changelog, exact proof and remaining boundaries are recorded
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Need → provider → gap: existing KeyKind::Str already has null-safe value equality in elemEq; its hot Map/Set rows and deletion rejected zero keys, while Table::hash dereferenced them after the eight-entry linear threshold. Removed only the key-null checks (receiver-null checks stay), made the existing string hash accept the typed null reference, and removed the equivalent array membership guard using the same equality. No new key kind, object layout, library, API or target-specific path.

Research: ECMAScript keyed collections admit arbitrary values as keys/elements and use SameValueZero (https://tc39.es/ecma262/2025/multipage/keyed-collections.html). Preserve Zinc D18: typed null/undefined share their existing null-reference representation and static flavour; optional undefined and explicit null are proved separately. This task does not change mixed-nullish value ABI. Existing string equality still compares separately allocated strings by contents; null and empty strings remain distinct.

Proof: own fresh tools/build zinc PASS through shared work-run queue. tests/run --only nullable_keys PASS on interpreter, native AOT and QuickJS, plus interpreter mem --check-leaks. Exact fixture proves inferred/explicit constructors, duplicate null, nullable undefined, small/hashed tables through160 strings, growth/rehash, lookup, replacement, delete/reinsert, clear/reuse, iteration, empty strings, allocated equal strings, array membership, reference-valued Map replacement and throw/finally cleanup. A null collection receiver still throws on all three engines. Existing tests/run --only collection_infer PASS; unchanged original two-line repro prints2/exit0. All commands bounded/headless, no process left. Logs .logs/1100/{build,nullable_keys,compat-original}.log, provenance .logs/1100/provenance.json. Existing V8 SDK/vendor warnings were recorded; no new warnings from changed runtime code and no overall warning-free claim.

Read-only main WIP reviewed first: array storage/realloc changes in rt.h and related array operations in rtcalls are separate from these key/hash/deletion hunks; none copied or committed. The coordinator must preserve them at integration.

Separate observed boundary: QuickJS native Set.values/Map.keys/values return iterators whereas lib/zinc.d.ts advertises arrays; set.values().length returns undefined there. Minimal .logs/1100/iterator-array.ts retained for coordinator follow-up. Current nullable-key iteration proof uses ordinary for-of counting, and nullable array membership is tested on an explicit array; no application code changed to hide a failure.

Proposed tests: owner-chosen cross-target nullable Map/Set smoke and long churn/leak/RC stress (minutes, memory unmeasured). No suite/T1/T2/demo, benchmark, fuzz or cross-target run performed. usage: n/a.
<!-- SECTION:NOTES:END -->
