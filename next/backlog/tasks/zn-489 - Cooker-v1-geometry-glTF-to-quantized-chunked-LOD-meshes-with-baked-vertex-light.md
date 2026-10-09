---
id: ZN-489
title: >-
  Cooker v1 geometry: glTF to quantized, chunked, LOD meshes with baked vertex
  light
status: Backlog
assignee: []
created_date: '2026-10-09 07:39'
labels:
  - handheld
  - pocketjs
milestone: m-23
dependencies:
  - ZN-433
ordinal: 300360
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc cook, a desktop program (Zinc code AOT-compiled plus C++ helpers): read glTF (cgltf) or a three.js scene exported by Zinc's three.js, split into cells, simplify per level with meshoptimizer, quantize positions to i16/u16 over the cell box (PSP: signed with a x32768 model scale), pack per-profile vertex layouts (PSP 8-12 B, 3DS/iOS 8-16 B, Vita 12-20 B), u16 indices in batches <= 65,535 vertices, and bake light into vertex colours (sun + ambient + AO by BVH ray casts, adaptive edge splits). Profiles psp30, vita60, n3ds30, ios60 carry triangle budgets and fail the cook with the section named. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A sample CC0 scene cooks for the four profiles; two cooks are byte-identical
- [ ] #2 Budgets per profile are enforced and a failure names the cell and section
- [ ] #3 Quantization error and triangle counts per LOD are in the receipt
- [ ] #4 No float positions are emitted for the psp profile (checked by a test)
<!-- AC:END -->
