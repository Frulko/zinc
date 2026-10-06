---
id: ZN-031
title: Single-app packaging decision
status: Done
assignee: []
created_date: '2026-10-05 14:22'
updated_date: '2026-10-06 16:43'
labels:
  - size-S
milestone: m-6
dependencies: []
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
- Acceptance: a recorded decision on the desktop app shell and product name (`ZincStudio` is taken), based on M1–M6 results. --- ## Decisions still open 1. Product name for the desktop app. 2. Scope of the QuickJS path (`zinc:script` only, or full engine). 3. Whether `--emit=ir` is a stable format. 4. Whether to replace `clang` with an in-process backend later.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a recorded decision on the desktop app shell and product name (`ZincStudio` is taken), based on M1–M6 results.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions recorded in docs/reports/zinc-next-decisions.md: name Zinc Atelier (check ZN-056), app shell in zinc:ui, QuickJS as a full second engine, IR not stable but must become stable, clang not replaced for now. Plan: ZN-047 to ZN-056 (and ZN-041 to ZN-043).
<!-- SECTION:NOTES:END -->
