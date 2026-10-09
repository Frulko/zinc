---
id: ZN-519
title: 'Power: AXP209 battery, charger, power key, low-battery policy'
status: Backlog
assignee: []
created_date: '2026-10-09 07:40'
labels:
  - chip
milestone: m-24
dependencies:
  - ZN-514
ordinal: 320070
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc:system power on Linux from sysfs (no D-Bus): axp20x-battery capacity, status, voltage and current, axp20x-usb/ac online, power key events from axp20x-pek, CPU governor, a low-battery callback and safe shutdown; document the AXP209 USB current limit (reg 0x30) and that suspend to RAM is not available (s2idle only). (From docs/reports/hardware/ntc-chip.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 battery percentage and charging state match upower on a PocketCHIP within 5 points
- [ ] #2 the API reads the QEMU AXP209 model in the CHIP-03 guest
- [ ] #3 a power-key press reaches the program as an event
- [ ] #4 idle power at the 5 V input recorded with the screen off and the governor at powersave
<!-- AC:END -->
