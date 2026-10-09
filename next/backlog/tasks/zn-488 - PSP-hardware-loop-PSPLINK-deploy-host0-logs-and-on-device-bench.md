---
id: ZN-488
title: 'PSP hardware loop: PSPLINK deploy, host0 logs and on-device bench'
status: Backlog
assignee: []
created_date: '2026-10-09 07:39'
labels:
  - handheld
  - pocketjs
milestone: m-23
dependencies:
  - ZN-486
  - ZN-468
ordinal: 300350
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc run --target psp --device: load the build over PSPLINK/usbhostfs_pc, stream stdout and bench JSONL to host0:, set 333 MHz (PSPLINK starts at 222), check MEMSIZE on PSP-1000 vs 2000+, and record a hardware receipt. Document the CFW prerequisites and the Memory Stick launch path (launch from the XMB too, not only from PSPLINK). (From docs/reports/hardware/pocketjs-pocket3d.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 pocket-hero runs on the owner's PSP from PSPLINK and from the Memory Stick through the XMB
- [ ] #2 A hardware bench receipt (150 s tape) reports frames, late frames and worst frame for renderer cpu and ge
- [ ] #3 docs/targets/psp.md lists the device prerequisites and known hardware-only pitfalls (dcache, texture flush, float 3D vertices, 64 px CLUT8 pages)
<!-- AC:END -->
