---
id: ZN-278
title: >-
  UI style: Style capability levels, profile degradation and module split
  (`zinc:ui/fx`)
status: Backlog
assignee: []
created_date: '2026-10-07 12:58'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-175
  - ZN-183
  - ZN-251
ordinal: 50780
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-29). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An esp32 build of hero-lite without extended keys: `size` of the image within +-1% of the baseline (recorded).
- [ ] #2 A program using `blur` on esp32 builds with a named warning, fails under `"style": "strict"`.
- [ ] #3 `zinc doctor` prints the style level and the properties ignored by the last build.
<!-- AC:END -->
