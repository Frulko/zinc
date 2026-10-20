---
id: ZN-682
title: 'zinc:3d: the bounds of a Node'
status: Backlog
assignee: []
created_date: '2026-10-10 19:36'
labels:
  - 3d
  - size-S
dependencies: []
ordinal: 438410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Found by the museum table, ZN-650.03 and ZN-650.04.) A viewer has to frame an object: zinc:3d gives no bounding box or sphere of a node and its children.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `bounds(node)` returns the box and the sphere of a subtree, with a test on a loaded OBJ and a GLB
<!-- AC:END -->
