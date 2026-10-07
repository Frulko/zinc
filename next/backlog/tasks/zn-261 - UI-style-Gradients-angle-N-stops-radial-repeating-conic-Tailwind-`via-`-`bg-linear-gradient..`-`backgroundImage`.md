---
id: ZN-261
title: >-
  UI style: Gradients: angle, N stops, radial, repeating, conic; Tailwind
  `via-`, `bg-[linear-gradient(..)]`, `backgroundImage`
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
  - ZN-176
  - ZN-182
  - ZN-259
ordinal: 50610
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-12). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Axis-aligned multi-stop equals the chained-rect lowering pixel for pixel; 45-degree and radial goldens on SW.
- [ ] #2 GL ramp texture within tolerance on llvmpipe; T2 uses at most the ramp page (atlas stats).
- [ ] #3 esp32: 2 stops linear only, others collapse with a log line; conic only on T3.
<!-- AC:END -->
