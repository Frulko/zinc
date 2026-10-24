---
id: ZN-521
title: 'Headless service export for the CHIP (systemd, watchdog, udev groups)'
status: Backlog
assignee: []
created_date: '2026-10-09 07:41'
labels:
  - chip
  - parked
milestone: m-24
dependencies:
  - ZN-517
ordinal: 93200
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc export --target chip writes a systemd unit (restart on failure, sunxi watchdog through /dev/watchdog), a non-root user with gpio, i2c, spi, video and input groups through udev rules, journald logging; the service and iot-board templates gain a chip preset. (From docs/reports/hardware/ntc-chip.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the iot-board template deployed to a CHIP starts at boot and restarts after a crash
- [ ] #2 the watchdog reboots the board when the program hangs (opt-in)
- [ ] #3 idle RSS and CPU of the service recorded
- [ ] #4 the unit file is covered by a T1 golden
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: parked. Headless service export for the CHIP: the Pi image and `zinc agent` cover the service story for Linux boards; CHIP-only parts need the board.
<!-- SECTION:NOTES:END -->
