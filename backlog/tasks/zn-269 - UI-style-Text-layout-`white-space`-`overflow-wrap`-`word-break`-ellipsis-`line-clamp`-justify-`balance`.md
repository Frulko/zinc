---
id: ZN-269
title: >-
  UI style: Text layout: `white-space`, `overflow-wrap`, `word-break`, ellipsis,
  `line-clamp`, justify, `balance`
status: Done
assignee: []
created_date: '2026-10-07 12:57'
updated_date: '2026-10-08 10:17'
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
- [x] #3 `measure` allocations not higher (ZN-189 counter).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. AC3: tests/t1/ui_alloc_text.sh counts allocations per layout pass of one long paragraph: default wrapping 437 (the path of before ZN-269), line-clamp-3 461, pre-wrap 606 (limit 1.5x), truncate 73. Fixes: ellipsize is a binary search (1843 to 73), a clamp without balance stops wrapping one line past the clamp, text-balance only for blocks of up to 6 lines (like Chrome; it wrapped the paragraph 13 times: 5515).
<!-- SECTION:NOTES:END -->
