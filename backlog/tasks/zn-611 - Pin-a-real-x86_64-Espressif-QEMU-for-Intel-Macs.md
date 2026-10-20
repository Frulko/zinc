---
id: ZN-611
title: Pin a real x86_64 Espressif QEMU for Intel Macs
status: Backlog
assignee: []
created_date: '2026-10-10 07:27'
labels:
  - toolchain
  - esp32
  - macos
  - bug
  - size-S
milestone: m-11
dependencies: []
priority: medium
ordinal: 182000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The pinned qemu-xtensa-softmmu-esp_develop_9.2.2_20260417-x86_64-apple-darwin.tar.xz (src/tc/tc.cpp:48) holds an arm64 binary (`file`: Mach-O 64-bit executable arm64; it links /opt/homebrew/opt/pixman, libgcrypt, sdl2), so on an Intel Mac `zinc run hello --target esp32 --qemu` ends with `zinc: cannot write to the device` (the shell says `bad CPU type in executable`). The esp_develop_9.2.2_20250817 x86_64 archive is a real x86_64 build (sha256 00b9dbc2124cf7633cb86f264fbc524226ad4001bce68bbdba43c9bdc4eb026e, the value in Espressif's checksum file); with ZINC_QEMU pointing at it export_esp32 passes. The pin table has one QEMU version for all hosts: let a pin carry its own version (directory and URL), pin the 20250817 build (or a newer true x86_64 one) for x86_64-macos, and check the unpacked binary's architecture so a wrong archive is refused with a message. It needs Homebrew's pixman, libgcrypt, sdl2, glib and gettext at run time: say so in zinc doctor.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 on an Intel Mac `zinc run hello --target esp32 --qemu` works without ZINC_QEMU
- [ ] #2 an archive whose binary is not for this machine is refused with a message naming the architecture
<!-- AC:END -->
