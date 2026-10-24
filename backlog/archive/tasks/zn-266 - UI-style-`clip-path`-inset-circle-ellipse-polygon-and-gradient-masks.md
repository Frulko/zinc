---
id: ZN-266
title: 'UI style: `clip-path` (inset, circle, ellipse, polygon) and gradient masks'
status: Backlog
assignee: []
created_date: '2026-10-07 12:57'
labels:
  - ui
  - style
  - size-L
milestone: m-17
dependencies:
  - ZN-181
  - ZN-174
ordinal: 105000
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-17). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Coverage goldens for each shape; hit test follows the shape.
- [ ] #2 T0/T1 clip to the bounding rect with one log line.
- [ ] #3 GL stencil path gated by caps (forced-failure test falls back to SW per ZN-183).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: dropped. Shape clipping and gradient masks have no user among the demos or kits; one later.md line is enough. Evidence: no clip-path anywhere; no kit uses it Verifier: No clip-path or mask in lib/std, the kits or the example sources (only generated web-export bundles), and rect and rounded clips exist: a later.md line.
<!-- SECTION:NOTES:END -->
