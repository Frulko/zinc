---
id: ZN-887
title: 'Zinc shell P2: the app on a KMS plane with dumb buffers and dmabuf'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-30 22:03'
updated_date: '2026-10-30 22:40'
labels:
  - size-L
  - pi
  - ui
milestone: m-25
dependencies: []
ordinal: 581460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Phase of the Zinc shell (D194, docs/reports/zinc-shell/03-design.md §8).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 dumb buffers exported as dmabuf to display-shell, shm fallback when /dev/dri is absent
- [ ] #2 the shown app's buffer goes on a KMS overlay plane at y = bar (fbdev layers), no copy
- [ ] #3 fbdev keeps the framebuffers of the last three picture serials (no ADDFB2/RMFB per app frame)
- [ ] #4 on the Spark: debugfs state shows the app on a plane; app frame CPU measured shell vs direct
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Coded (4c9bce158 fbdev keeps the framebuffers of the last three pictures; fa8beb6a5 zinc:shell gives the app three dumb buffers exported as dmabufs, shm fallback, ZINC_SHELL_DMABUF=0 forces shm; ZINC_SHELL_START=<app dir> shows an app at start). Not proven on the Pi yet: debugfs XR24 plane at y=bar, ZINC_FBDEV_STATS ADDFB2/RMFB 3/0, CPU shell-planes vs soft vs direct.

2026-10-30 on the Spark (engine 0.9.1+708): the app is on its own XR24 plane at crtc-pos 800x448+0+32, allocated by zinc; app 1.4%, shell 4.2% CPU. Not measured: ZINC_SHELL_DMABUF=0 and direct for comparison.
<!-- SECTION:NOTES:END -->
