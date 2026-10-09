---
id: ZN-464
title: 'Vita: bouncing-ball with 3-core band raster'
status: Backlog
assignee: []
created_date: '2026-10-09 07:37'
labels:
  - handheld
  - handhelds
  - perf
  - vita
  - size-M
milestone: m-23
dependencies:
  - ZN-459
ordinal: 300110
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Persistent band workers pinned to SCE_KERNEL_CPU_MASK_USER_0..2, raster built with -O3 -mcpu=cortex-a9 -mfpu=neon, frames written to CDRAM framebuffers (no CPU readback), triple buffering at vblank.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/bouncing-ball runs unchanged in Vita3K
- [ ] #2 frame time split (logic, raster, present) logged with ZINC_LOG
- [ ] #3 maximum ball count at 60 fps recorded with a 90 % gate
<!-- AC:END -->
