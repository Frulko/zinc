---
id: ZN-554
title: 'zinc:power: thermal, clocks, throttling and under-voltage'
status: Backlog
assignee: []
created_date: '2026-10-09 07:46'
labels:
  - rpi
  - sdk
  - size-S
milestone: m-25
dependencies:
  - ZN-535
ordinal: 340200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Temperatures from thermal zones, current and maximum CPU clock, throttled flags from the firmware mailbox (/dev/vcio GET_THROTTLED) with the hwmon in0_lcrit_alarm fallback, Pi 5 power button and fan state. Events on change; zinc doctor uses them. (From docs/reports/hardware/raspberry-pi-threejs-and-sdk.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 values match vcgencmd on the Pi 3B+
- [ ] #2 a QEMU raspi3b run degrades to unknown without errors
- [ ] #3 an under-voltage event is reported with a weak supply on the rig (manual check)
<!-- AC:END -->
