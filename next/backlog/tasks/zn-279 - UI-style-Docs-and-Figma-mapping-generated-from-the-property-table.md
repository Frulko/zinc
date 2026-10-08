---
id: ZN-279
title: 'UI style: Docs and Figma mapping generated from the property table'
status: Done
assignee: []
created_date: '2026-10-07 12:58'
updated_date: '2026-10-08 10:47'
labels:
  - ui
  - style
  - size-S
milestone: m-17
dependencies:
  - ZN-250
  - ZN-252
ordinal: 50790
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-30). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The property table in `docs/ui.md` is generated and checked in CI (diff test).
- [x] #2 `docs/figma-ui.md` lists the Figma property to style key mapping for the new keys.
- [x] #3 `isKnownClass` and the CSS importer reject exactly the same set (test).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. AC2: docs/figma-ui.md has the Figma property to style key table (gap, padding, min/max, radius per corner, stroke weight/dash/colour per side, opacity, text shadow, family/weight/italic, case/decoration, spacing, truncation, align, z, clip, selection/focus ring). AC3: the repo has no CSS importer yet (only the report mentions one); the equality that exists is tested: tests/t1/ui_tokens.sh makes the JSX check (validClass) accept exactly the tokens isKnownClass accepts and refuse the rest. A CSS importer would reuse that table.
<!-- SECTION:NOTES:END -->
