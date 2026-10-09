---
id: ZN-514
title: QEMU cubieboard simulator for the CHIP
status: Backlog
assignee: []
created_date: '2026-10-09 07:40'
labels:
  - chip
milestone: m-24
dependencies:
  - ZN-512
ordinal: 320020
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Run armv7-linux programs on a real Cortex-A8 under qemu-system-arm -M cubieboard (Allwinner A10: AXP209 on I2C0 0x34, I2C, SPI0, GPIO, EMAC, USB, SD): pinned or checksummed kernel (Debian armmp 6.12 or mainline 6.12 LTS) with sun4i-a10-cubieboard.dtb plus an overlay adding QEMU's pcf8574 at 0x38, gpio-sim and vkms; a busybox initramfs that runs the program; zinc run --target chip --qemu. Works on macOS (Homebrew qemu) and Linux; unparks the armhf criteria of ZN-133 and ZN-145. (From docs/reports/hardware/ntc-chip.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc run --target chip --qemu hello.ts boots and prints in under 30 s on the dev Mac
- [ ] #2 bouncing-ball and hero headless frames under the simulator match the host goldens (ZINC_FRAMES, frame hashes)
- [ ] #3 the guest sees /sys/class/power_supply from the AXP209 model, a pcf8574a gpiochip, gpio-sim lines and a vkms card
- [ ] #4 a T2 test runs it and skips with exit 77 when qemu-system-arm is missing
<!-- AC:END -->
