---
id: ZN-493
title: GXM 3D renderer and Cg shader pipeline with a cached GXP set
status: Backlog
assignee: []
created_date: '2026-10-09 07:39'
labels:
  - handheld
  - pocketjs
milestone: m-23
dependencies:
  - ZN-490
  - ZN-471
ordinal: 300400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GXM device kernel (clean-room): CDRAM and uncached blocks, frame rings released after the GPU, program registration and patching, MSAA 4x display surface drawn into directly, parameter buffer raised to 32 MB. Shaders written in Cg, compiled on the owner's console with SceShaccCg (libshacccg.suprx) at development time, cached as GXP keyed by source hash and shipped. Renderer: pack layouts for vita60, per-vertex sun lighting with normals, fog, sky, governor on near/mid distances. (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The sample pack renders in Vita3K with scene counters (draws, triangles) matching the pack viewer
- [ ] #2 Cached GXPs are versioned; a missing GXP fails the build with the shader named
- [ ] #3 Hardware: 60 fps at 960x544 with 4x MSAA on the route, receipt recorded
<!-- AC:END -->
