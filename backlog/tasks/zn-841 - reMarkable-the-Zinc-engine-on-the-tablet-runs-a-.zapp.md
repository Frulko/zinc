---
id: ZN-841
title: 'reMarkable: the Zinc engine on the tablet runs a .zapp'
status: Backlog
assignee: []
created_date: '2026-10-25 19:26'
labels:
  - remarkable
  - size-L
milestone: m-11
dependencies: []
ordinal: 550460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hub step 1 (owner 2026-10-25: an app store for the reMarkable). zinc itself, built for aarch64-linux (glibc of the tablet), installed as an AppLoad tile, runs a .zapp with the display-rmpp driver: qtfb (L0) under AppLoad and the ink session (L2) under the lease. zinc compiles a project on the tablet (TS to ZBC, no C toolchain). Native plugins come prebuilt in the .zapp (native/linux-aarch64). docs/reports/remarkable-bridge-design.md, docs/targets/remarkable-paper-pro.md, docs/zapp.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 an engine bundle for the tablet (zinc aarch64-linux plus display-rmpp, lease, libquill.so) is produced by one command from the Mac and installed by its deploy.sh
- [ ] #2 zinc run notes.zapp on the tablet draws on qtfb under AppLoad, and in the ink session through the lease; proven by the owner on the tablet
- [ ] #3 zinc pack on the tablet packs a project copied there, and the pack runs
- [ ] #4 a T1 test proves the bundle's layout and launcher scripts on the Mac
<!-- AC:END -->
