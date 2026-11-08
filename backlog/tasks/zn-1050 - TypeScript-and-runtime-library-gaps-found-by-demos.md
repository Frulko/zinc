---
id: ZN-1050
title: TypeScript and runtime library gaps found by demos
status: Backlog
assignee: []
created_date: '2026-11-07 16:39'
labels:
  - typescript
  - size-M
milestone: m-13
dependencies: []
ordinal: 3100
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Engine gaps (fixed, not worked around): Number.prototype.toLocaleString, JSON.stringify with a replacer and Dyn key order, QuickJS UTF-8 bytes and clock resolution, a zip/inflate API.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- QuickJS: strings of raw bytes (Response.bytes(), an event's rawBody) turn UTF-8 bytes into U+FFFD; the same gap as the zinc:subtle one fixed on 2026-10-29.
- QuickJS: sys.clock() read 0 ms around a sub-millisecond loop; check its resolution.
- TypeScript: Number.prototype.toLocaleString is missing; the iPod Settings shows plain numbers.
- TypeScript: a Dyn JSON.stringify writes integer-like keys in insertion order; JavaScript writes them first, ascending.
- TypeScript: JSON.stringify with a replacer function is refused.
- Mapper: a value of type `any` is refused as a ternary's condition (Z0103 any to boolean) where TypeScript takes it; hit in the sync card, typed the state instead.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 toLocaleString on number compiles and formats in the interpreter, AOT and QuickJS
- [ ] #2 JSON.stringify accepts a replacer function; integer-like keys come first, ascending
- [ ] #3 QuickJS raw-byte strings keep UTF-8 bytes; sys.clock() resolves sub-millisecond
- [ ] #4 A test per item on every engine
<!-- AC:END -->
