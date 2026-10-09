---
id: ZN-526
title: HDMI and VGA DIPs
status: Backlog
assignee: []
created_date: '2026-10-09 07:41'
labels:
  - chip
milestone: m-24
dependencies:
  - ZN-522
  - ZN-515
ordinal: 320140
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Use NTC's mainline overlays (x-chip-dip-hdmi: Chrontel CH7033 on I2C1 0x76; x-chip-dip-vga: dumb VGA DAC with EDID on I2C1), applied by U-Boot at boot, kernel config DRM_CHRONTEL_CH7033, DRM_SIMPLE_BRIDGE, DRM_DISPLAY_CONNECTOR; output through the KMS path; supply and USB current limit documented. (From docs/reports/hardware/ntc-chip.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a Zinc program shows on an HDMI monitor through the HDMI DIP at a mode read from EDID
- [ ] #2 the same on VGA through the VGA DIP
- [ ] #3 the overlays and kernel options are documented in docs/targets/chip.md
- [ ] #4 brown-out conditions and the required supply documented
<!-- AC:END -->
