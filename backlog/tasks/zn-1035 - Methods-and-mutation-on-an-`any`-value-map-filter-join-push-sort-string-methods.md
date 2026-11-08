---
id: ZN-1035
title: >-
  Methods and mutation on an `any` value (map, filter, join, push, sort, string
  methods)
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:37'
updated_date: '2026-11-08 22:35'
labels:
  - checker
  - dyn
  - size-M
milestone: m-13
dependencies: []
ordinal: 6100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Z0105 refuses `d.codecs.map(...)` and the like on an `any`; Discord code had to use loops. Decide the rule (TypeScript allows them) and implement: array and string methods on a Dyn value run on the real array in place, including mutation (`push`, `splice`, `sort`), not on a copy.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-873: Z0105 refuses a method call on an any value (d.codecs.map); decide if intended, and if so the diagnostic should suggest a for-of loop.
- ZN-904: method calls on an any value (.map, .filter, .join) are refused with Z0105; Discord's state.ts, emoji.ts and the fake use loops instead.
- ZN-?: array mutation (`push`, `splice`, `sort`) and string methods on an `any` value are still refused (the new `any` array methods run on a copy).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `const d: any = JSON.parse(...)` then `d.items.map(f)`, `.filter`, `.join`, `.push(x)`, `.sort()` and string methods work on interpreter, AOT and QuickJS
- [x] #2 the mutation is visible through the original `any`
- [x] #3 a test and a `zinc explain` update; the Discord guard and state.ts loops can be written with map
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-11-08 (worktree agent).

Rule (decision, to record by the coordinator): a method call on an any value whose name is an array or string method is allowed, as in TypeScript. The checker rewrites it (check.cpp, dynMethodKind): array methods (map, filter, forEach, some, every, find, findIndex, findLast, findLastIndex, reduce, reduceRight, join, push, pop, shift, unshift, splice, sort, reverse, fill) run on the DynArr's own items through __dynItems(d, m) (no copy, so mutation is seen through the any); string methods (toUpperCase, toLowerCase, trim*, split, charAt, charCodeAt, codePointAt, startsWith, endsWith, padStart, padEnd, replace, replaceAll, substring, substr, repeat, localeCompare) run on the DynStr through __dynStrOf(d, m); includes, indexOf and slice dispatch at run time (__dynIncludes, __dynIndexOf, __dynSlice). sort() with no comparator uses __dynSortCmp (JS order: by text, undefined last). The wrong kind throws TypeError('<kind> has no method m()'). Other methods stay Z0105, whose message now says only the array and string methods run on an any. QuickJS runs real JS: nothing to do there. The copy-based __dynMap/__dynFilter are gone.

Proof: tests/t0/dyn_array_methods.sh extended (push, sort, splice, pop, shift, reverse, reduce, string methods, slice, JSON of the mutated tree) passes on interpreter, default engine and QuickJS. zinc explain Z0105 shows the any example (docs/diagnostics.md regenerated with ZINC_LANG=en). examples/discord: state.ts applied_tags and fake-discord.ts codecs written with map; zinc check examples/discord and fake-discord.ts clean.

Web search (sonnet): C# DLR call-site caches (https://github.com/IronLanguages/dlr/wiki/runtime-1), Static Hermes typed/untyped boundary checks (https://speakerdeck.com/tmikov2023/optimizing-with-static-hermes-chain-react-2024), Static Python gradual soundness (https://arxiv.org/pdf/2206.13831). Pitfalls kept: sort() compares as strings, mutators act on the receiver, string methods return new values. A per-site cache is not needed here: the method name is known at compile time, only the receiver kind is checked.

later.md lines (for the coordinator):
- ZN-1035: a typed array stored into an any (const e: any = { list: ns }) is copied, so e.list.push(1) does not change ns (TypeScript does); the Dyn view of a typed array would need a DynRef over the array.
- ZN-1035: xs.slice(1, Infinity) and 'abc'.slice(1, Infinity) give the wrong length on the typed engines (the f64 Infinity into the i32 'j' parameter); clamp f64 to i32 at the runtime-call boundary.

Proposed tests: tests/run --only dyn_array_methods (3 engines, ~10 s, <200 MB).
<!-- SECTION:NOTES:END -->
