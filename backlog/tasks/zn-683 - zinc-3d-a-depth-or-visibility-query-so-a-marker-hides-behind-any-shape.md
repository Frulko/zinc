---
id: ZN-683
title: 'zinc:3d: a depth or visibility query, so a marker hides behind any shape'
status: Backlog
assignee: []
created_date: '2026-10-10 19:36'
labels:
  - 3d
  - size-S
dependencies: []
ordinal: 439410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Found by the museum table, ZN-650.03 and ZN-650.04.) Points of interest on an object are hidden when they face away, which is right for a convex vase only; a query of the depth at a pixel (or a ray cast against the scene) hides a point behind any shape.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a point behind a handle of a concave test model is reported hidden, in the software and the GPU renderer (test)
<!-- AC:END -->
