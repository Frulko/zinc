---
id: ZN-681
title: 'Museum table: ship the vase as a decimated GLB'
status: Backlog
assignee: []
created_date: '2026-10-10 19:36'
labels:
  - demo
  - assets
  - size-S
dependencies: []
ordinal: 437410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Found by the museum table, ZN-650.03 and ZN-650.04.) The viewer accepts glTF/GLB and the Smithsonian's 150k-triangle GLB gives the better frame, but it would take the example to 11.4 MB, so the decimated OBJ ships and the GLB path has no automated test. A GLB writer in the example's tools/decimate.cpp gives a small GLB and puts the path under test.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the example ships a decimated .glb under its size limit and museum_viewer runs on it
- [ ] #2 the OBJ and the GLB give the same frame within tolerance
<!-- AC:END -->
