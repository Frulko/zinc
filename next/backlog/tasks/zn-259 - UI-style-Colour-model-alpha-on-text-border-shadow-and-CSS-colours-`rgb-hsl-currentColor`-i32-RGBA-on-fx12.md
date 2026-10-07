---
id: ZN-259
title: >-
  UI style: Colour model: alpha on text, border, shadow and CSS colours;
  `rgb()/hsl()/currentColor`; i32 RGBA on fx12
status: Backlog
assignee: []
created_date: '2026-10-07 12:57'
labels:
  - ui
  - style
  - size-S
milestone: m-17
dependencies:
  - ZN-250
ordinal: 50590
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-11). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Parser tests for 30 colour strings including `/50`.
- [ ] #2 Compile for `ps1` (fx12): no overflow, colours identical to the f32 build.
- [ ] #3 `text-white/60` golden.
<!-- AC:END -->
