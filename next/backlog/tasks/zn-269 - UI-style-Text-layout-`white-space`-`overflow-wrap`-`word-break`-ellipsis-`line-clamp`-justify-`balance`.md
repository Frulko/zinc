---
id: ZN-269
title: >-
  UI style: Text layout: `white-space`, `overflow-wrap`, `word-break`, ellipsis,
  `line-clamp`, justify, `balance`
status: Review
assignee: []
created_date: '2026-10-07 12:57'
updated_date: '2026-10-08 07:05'
labels:
  - ui
  - style
  - size-L
milestone: m-17
dependencies:
  - ZN-114
  - ZN-165
  - ZN-268
ordinal: 50690
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-20). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `line-clamp-3` on a 600-char string yields 3 lines ending in the ellipsis (exact string test, then golden).
- [x] #2 Explicit `\n`, `nowrap` and `pre` tests; default wrapping identical (proto text goldens).
- [ ] #3 `measure` allocations not higher (ZN-189 counter).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. whitespace-normal/nowrap/pre/pre-wrap, break-normal/words/all, truncate, text-ellipsis/clip, line-clamp-N/none, text-justify (free width to the spaces), text-balance (narrowest width keeping the line count). Exact-line test golden/ui-textlayout (630-char line-clamp-3 ends in the ellipsis), scene ui-style/text-layout, token rows; canary 4/4. Ellipsis glyph baked when used. Open: AC3 no allocation counter available (default path unchanged, one extra function call), whitespace-pre-line, style-object keys.
<!-- SECTION:NOTES:END -->
