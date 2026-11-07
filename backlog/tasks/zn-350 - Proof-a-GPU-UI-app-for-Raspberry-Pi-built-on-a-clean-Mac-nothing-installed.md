---
id: ZN-350
title: 'Proof: a GPU UI app for Raspberry Pi built on a clean Mac, nothing installed'
status: Backlog
assignee: []
created_date: '2026-10-08 14:35'
labels:
  - distribution
  - rpi
  - size-M
milestone: m-19
dependencies:
  - ZN-334
  - ZN-337
  - ZN-349
ordinal: 53600
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From a macOS user account with no toolchain: `zinc new desktop-app`, `zinc export --target rpi` (display-gl) and `--target rpi1` (display-fbdev); run in the Pi emulation the simulators provide (QEMU aarch64 user mode in a Linux container for the binary, the frame through the headless HAL) and compare a frame with the macOS run. The run on the Pi test rig is a separate task labelled needs-board.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 on a clean macOS account the export of both targets succeeds without any install prompt
- [ ] #2 the exported aarch64 binary runs under QEMU user mode and its first frame equals the macOS frame (tolerance policy of TESTING.md)
- [ ] #3 a needs-board task records the command to run it on the Pi test rig
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: cross-platform pass. (corrected: park proposed; it needs only the Raspberry Pi 3B+ or the Intel Mac, both available since 2026-11-07 (owner): cross-platform pass, not parked.)
<!-- SECTION:NOTES:END -->
