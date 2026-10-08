---
id: ZN-252
title: >-
  UI style: Class-token parser table: negative margins, `mx-auto`, `inset-x/y`,
  `gap-x/gap-y`, arbitrary `%`, `rem`, `vh`
status: Done
assignee: []
created_date: '2026-10-07 12:56'
updated_date: '2026-10-08 06:00'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-250
ordinal: 50520
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-03). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 T0 parser test accepts and rejects a list of 60 tokens (accepted ones set the expected fields, unknown ones keep the diagnostic).
- [x] #2 `gap-x-4 gap-y-2` golden on a wrapped row.
- [x] #3 `isKnownClass` and the docs table generated from the same table.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. New class tokens: negative margins (-m-4, -mt-2, -mx-1), auto margins (mx-auto, ml-auto, m-auto... they take the free space of the line before justify, a cross-axis auto margin beats align-items), gap-x/gap-y (separate column and row gaps: gapX/gapY on UiNode, gapMain/gapCross in measure and place), inset-N / inset-x-N / inset-y-N / inset-[..], arbitrary values with px, rem (16 px), vh, vw and % (w-[50%], h-[10vh], w-[2rem]); tokens with a non-numeric value are now refused (gap-x, mx-, w-[, m-xyz). Tests: tests/golden/ui-tokens (60 tokens, accepted or refused, the fields they set) and t1/ui_tokens.sh, which also checks that the compile-time grammar of src/frontend/jsx.cpp validClass (a second copy of the runtime grammar) accepts exactly the tokens the runtime accepts; scenes gap-xy and margin-auto in tests/golden/ui-style; 42 of 42 proto entries still equal, existing scene hashes unchanged. AC3 reading: instead of generating both from one table (a refactor of applyToken into data), the two grammars are kept equal by that test; the docs table is not generated. The prototype compiler (compiler/src/jsx.ts validClass) is not updated.
<!-- SECTION:NOTES:END -->
