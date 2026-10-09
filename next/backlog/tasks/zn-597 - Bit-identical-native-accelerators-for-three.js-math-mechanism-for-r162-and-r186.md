---
id: ZN-597
title: >-
  Bit-identical native accelerators for three.js math (mechanism for r162 and
  r186)
status: Backlog
assignee: []
created_date: '2026-10-09 09:28'
labels:
  - perf
  - quickjs
  - 3d
  - size-M
milestone: m-21
dependencies:
  - ZN-596
priority: high
ordinal: 5630
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Measured: replacing Matrix4.prototype.multiplyMatrices of three r186 by a native function that reads the plain-Array `elements` in place gives 1.61 -> 0.084 us per call and the three.js CPU frame of 500 meshes 7.9 -> 6.0 ms (-24%), results bit-identical when compiled with -ffp-contract=off and the same operation order. Build the mechanism: an accelerator table installed on library prototypes by the web environment (opt-out flag), each native method guarded (fast array of 16 numbers, plain data property) with the original JS method as fallback; then the hot set: Matrix4.multiplyMatrices/compose/invert, Matrix3.getNormalMatrix, Vector3/Vector4.applyMatrix4, Sphere.applyMatrix4, Frustum.intersectsSphere/intersectsObject, Quaternion.setFromEuler, Object3D.updateMatrix. ZN-543 then builds the Pi-specific batch operations (subtree world matrices, culling lists, skinning) on this mechanism. (From docs/reports/quickjs-aot-jit-and-ffi.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a host test compares every accelerated method with three's JS on 10^5 random inputs: bit-identical outputs (===), including -0 and NaN cases
- [ ] #2 the report's w_three workload (500 meshes) <= 4.5 ms per frame on the M1 Pro (today 7.9 ms)
- [ ] #3 accelerators can be disabled (ZINC_JS_ACCEL=0) and the three.js demo frames are identical either way
- [ ] #4 works for vendored three r186 and r162
<!-- AC:END -->
