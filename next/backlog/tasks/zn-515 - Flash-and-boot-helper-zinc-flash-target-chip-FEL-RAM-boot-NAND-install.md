---
id: ZN-515
title: 'Flash and boot helper: zinc flash --target chip (FEL RAM boot, NAND install)'
status: Backlog
assignee: []
created_date: '2026-10-09 07:40'
labels:
  - chip
milestone: m-24
dependencies:
  - ZN-513
ordinal: 320030
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pin sunxi-tools (built from source, with the macOS bulk-error patch of DatanoiseTV/second-boot) like esptool, and checksummed boot artifacts. --ram: FEL-load mainline U-Boot, kernel, DTB (+PocketCHIP overlay) and an initramfs with busybox, the g_cdc gadget and the app; NAND untouched. --nand: reuse the community installers (pocketchip-debian-builder or second-boot: FEL-boot an installer, ubiformat the slc-mode UBI from the running kernel). Document restore to NTC images (Flash Collection) and the USB current-limit fix. (From docs/reports/hardware/ntc-chip.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc flash --target chip --ram boots a CHIP to a shell reachable over the USB gadget (ACM and ECM) in under 60 s without writing NAND
- [ ] #2 detects the FEL device 1f3a:efe8 and explains the FEL jumper when it is absent
- [ ] #3 the NAND install is documented and validated on at least one board, which then boots Debian trixie from NAND across three cold power cycles
- [ ] #4 the restore path to stock NTC 4.4 is documented
<!-- AC:END -->
