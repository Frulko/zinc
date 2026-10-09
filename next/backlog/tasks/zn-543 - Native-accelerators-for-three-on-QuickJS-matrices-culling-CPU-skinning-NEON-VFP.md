---
id: ZN-543
title: >-
  Native accelerators for three on QuickJS: matrices, culling, CPU skinning
  (NEON/VFP)
status: Backlog
assignee: []
created_date: '2026-10-09 07:45'
labels:
  - rpi
  - 3d
  - size-L
milestone: m-25
dependencies:
  - ZN-541
ordinal: 340090
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Host functions callable from QuickJS replace hot three.js paths on T2: world-matrix updates for flagged subtrees, frustum culling of object lists, and CPU skinning of SkinnedMesh into a dynamic vertex buffer (NEON on aarch64, VFP on ARMv6). Includes a SkinnedMesh shim, because WebGL1 r162 has no GPU skinning. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 JS time per frame of the C2 bench halved or better on the Pi 3B+
- [ ] #2 a skinned glTF (<= 10k vertices, <= 60 bones) animates at >= 30 fps on the Pi 3B+
- [ ] #3 results match three's JS path within 1e-5 in a host test
<!-- AC:END -->
