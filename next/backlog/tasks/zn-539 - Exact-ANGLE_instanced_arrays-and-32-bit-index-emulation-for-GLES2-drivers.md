---
id: ZN-539
title: Exact ANGLE_instanced_arrays and 32-bit index emulation for GLES2 drivers
status: Backlog
assignee: []
created_date: '2026-10-09 07:45'
labels:
  - rpi
  - 3d
  - size-M
milestone: m-25
dependencies:
  - ZN-538
ordinal: 340050
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When the driver lacks instancing (Mesa vc4), libzn_webgl implements ANGLE_instanced_arrays by issuing one draw per instance, setting divisor attributes as constant attributes from CPU shadow copies. When 32-bit indices are not native (vc4 silently truncates them to 16 bits), drawElements with UNSIGNED_INT is split or rebased into 16-bit chunks. WebGL semantics are kept exactly. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 WebGL1 conformance pages for ANGLE_instanced_arrays and OES_element_index_uint pass under ZN_WEBGL_PROFILE=vc4
- [ ] #2 three r162 InstancedMesh renders on the Pi 3B+ with SSIM >= 0.9 against Chrome WebGL1
- [ ] #3 a 100k-vertex indexed mesh renders correctly on the Pi 3B+
- [ ] #4 cost per emulated instance recorded
<!-- AC:END -->
