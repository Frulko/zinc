---
id: ZN-463
title: 'PSP: bouncing-ball with the software raster and a GE copy'
status: Backlog
assignee: []
created_date: '2026-10-09 07:37'
labels:
  - handheld
  - handhelds
  - perf
  - psp
  - size-M
milestone: m-23
dependencies:
  - ZN-458
ordinal: 214562
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Render the damaged bands into a 5650 RAM buffer, sceKernelDcacheWritebackRange, sceGuCopyImage into the 512-stride back buffer, flip at vblank; f32 numbers; audit runtime raster and gfx hot paths for double math.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/bouncing-ball runs unchanged (only zinc.json targets.psp) in PPSSPPHeadless
- [ ] #2 a --screenshot-save golden matches the host render with the psp profile within the agreed MSE
- [ ] #3 the maximum ball count at 60 fps is recorded in docs/reports/handheld-perf.md (hardware if available, PPSSPP marked non-authoritative) and a 90 % gate is set
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: merged into ZN-486. Software raster on PSP runs bouncing-ball (breakout/bouncing-ball in PPSSPP, GE replay since 27202ba5); only the recorded ball count and gate are left, shared with 464/465. Evidence: targets/psp/gu_psp.cpp; commit 27202ba5; backlog/later.md:680 Verifier: ZN-486 is open and is the receipts/gate harness; carry over bouncing-ball's max ball count at 60 fps and the 90% gate. docs/reports/handheld-perf.md (named in AC3) does not exist; the emulator proof in console_emulators.sh is breakout's pad session, not bouncing-ball, so carry the bouncing-ball golden too.
<!-- SECTION:NOTES:END -->
