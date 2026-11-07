---
id: ZN-551
title: 'zinc:pwm: sysfs, chardev on kernel 6.17+, Pi 5 channel map'
status: Backlog
assignee: []
created_date: '2026-10-09 07:46'
labels:
  - rpi
  - sdk
  - size-S
milestone: m-25
dependencies:
  - ZN-549
ordinal: 51200
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hardware PWM through /dev/pwmchipN ioctls when present (atomic waveform), otherwise sysfs (period written before duty). Per-model pin and channel map: Pi 1-4 pwmchip0 with 2 channels; Pi 5 RP1 with 4 channels and the fan channel reserved. Guidance for the pwm-gpio overlay. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 fake sysfs tree test passes on the host
- [ ] #2 on the Pi 3B+ a GPIO edge timer measures period and duty within 1 %
- [ ] #3 Pi 5 map validated in RPI-SDK-14
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: cross-platform pass. (corrected: park proposed; it needs only the Raspberry Pi 3B+ or the Intel Mac, both available since 2026-11-07 (owner): cross-platform pass, not parked.)
<!-- SECTION:NOTES:END -->
