---
id: ZN-560
title: Linux kernel-simulation CI image and QEMU raspi boot tests
status: Backlog
assignee: []
created_date: '2026-10-09 07:46'
labels:
  - rpi
  - sdk
  - size-L
milestone: m-25
dependencies:
  - ZN-133
ordinal: 340260
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A pinned Linux VM image (QEMU virt) with gpio-sim, i2c-stub, vkms, vivid, vicodec, visl, snd-aloop, uinput, mac80211_hwsim, hci_vhci, BlueZ, NetworkManager and Mesa llvmpipe. Plus QEMU raspi0, raspi1ap, raspi3b and raspi4b boots of Raspberry Pi OS kernels that check board detection. Wired as a t2 job. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 one command runs every SDK module test in the VM on Linux CI
- [ ] #2 QEMU raspi boots report the right model through zinc:board
- [ ] #3 image and QEMU pinned with checksums
<!-- AC:END -->
