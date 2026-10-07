---
id: ZN-279
title: 'UI style: Docs and Figma mapping generated from the property table'
status: Backlog
assignee: []
created_date: '2026-10-07 12:58'
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
- [ ] #1 The property table in `docs/ui.md` is generated and checked in CI (diff test).
- [ ] #2 `docs/figma-ui.md` lists the Figma property to style key mapping for the new keys.
- [ ] #3 `isKnownClass` and the CSS importer reject exactly the same set (test).
<!-- AC:END -->
