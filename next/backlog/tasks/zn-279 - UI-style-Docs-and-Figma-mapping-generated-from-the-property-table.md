---
id: ZN-279
title: 'UI style: Docs and Figma mapping generated from the property table'
status: Review
assignee: []
created_date: '2026-10-07 12:58'
updated_date: '2026-10-08 07:15'
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
- [ ] #2 `docs/figma-ui.md` lists the Figma property to style key mapping for the new keys.
- [ ] #3 `isKnownClass` and the CSS importer reject exactly the same set (test).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. tools/ui-docs generates the style key table (PROP) and the accepted class tokens into docs/ui.md; tests/t0/ui_docs.sh checks it is current. The Figma property to style key table is written into docs/figma-ui.md, which is an untracked file of another developer, so it is not committed. Open: AC2 commit of figma-ui.md, AC3 there is no CSS importer in the repo yet (isKnownClass vs the JSX grammar are already kept equal by ui_tokens).
<!-- SECTION:NOTES:END -->
