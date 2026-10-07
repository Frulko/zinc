---
id: ZN-265
title: >-
  UI style: Filters: `blur()`, `backdrop-blur`, brightness/grayscale;
  drop-shadow filter
status: Backlog
assignee: []
created_date: '2026-10-07 12:57'
labels:
  - ui
  - style
  - size-L
milestone: m-17
dependencies:
  - ZN-174
  - ZN-183
  - ZN-178
ordinal: 50650
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-16). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Box-blur golden on SW with correct damage growth (diff test).
- [ ] #2 Pi 3: at most one blur pass per frame, frame p99 not worse than SW + 20% (R3.1 criterion style).
- [ ] #3 esp32: blur ignored, `backdrop-blur bg-white/70` fallback fill is what shows.
<!-- AC:END -->
