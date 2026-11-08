---
id: ZN-1035
title: >-
  Methods and mutation on an `any` value (map, filter, join, push, sort, string
  methods)
status: Backlog
assignee: []
created_date: '2026-11-07 16:37'
labels:
  - checker
  - dyn
  - size-M
milestone: m-13
dependencies: []
ordinal: 6100
updated_date: '2026-11-07 18:30'
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
- [ ] #1 `const d: any = JSON.parse(...)` then `d.items.map(f)`, `.filter`, `.join`, `.push(x)`, `.sort()` and string methods work on interpreter, AOT and QuickJS
- [ ] #2 the mutation is visible through the original `any`
- [ ] #3 a test and a `zinc explain` update; the Discord guard and state.ts loops can be written with map
<!-- AC:END -->
