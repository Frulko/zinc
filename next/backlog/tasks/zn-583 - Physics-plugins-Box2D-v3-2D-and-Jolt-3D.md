---
id: ZN-583
title: 'Physics plugins: Box2D v3 (2D) and Jolt (3D)'
status: Backlog
assignee: []
created_date: '2026-10-09 08:12'
labels:
  - games
  - js
  - size-L
milestone: m-22
dependencies: []
ordinal: 362270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
matter-js, planck and cannon-es run 20-40x slower on QuickJS than on V8 (planck 500 bodies: 28.5 ms per step). Native plugins physics2d (Box2D v3, MIT) and physics3d (Jolt, MIT), vendored with licences, typed APIs (world, bodies, shapes, joints, contacts, raycasts) and a JS API for QuickJS; an optional planck-shaped JS facade for common calls. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 2,000 piled 2D bodies step in <= 2 ms in AOT and <= 3 ms from QuickJS through the JS API
- [ ] #2 1,000 3D bodies step in <= 3 ms
- [ ] #3 deterministic replay: same positions after 600 steps
- [ ] #4 builds for macOS, Linux and armhf with the pinned zig
<!-- AC:END -->
