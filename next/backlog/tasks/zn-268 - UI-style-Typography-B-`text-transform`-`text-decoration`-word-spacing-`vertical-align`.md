---
id: ZN-268
title: >-
  UI style: Typography B: `text-transform`, `text-decoration`, word spacing,
  `vertical-align`
status: Backlog
assignee: []
created_date: '2026-10-07 12:57'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-267
ordinal: 50680
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-19). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Goldens for underline, line-through, uppercase, word spacing.
- [ ] #2 Decoration is `rrect` commands only (command-count test).
- [ ] #3 Non-Latin-1 uppercase works on desktop profiles via ZN-165 tables, ignored with a log line on esp32.
<!-- AC:END -->
