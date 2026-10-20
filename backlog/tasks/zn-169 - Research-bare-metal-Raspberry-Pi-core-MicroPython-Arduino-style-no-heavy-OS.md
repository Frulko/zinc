---
id: ZN-169
title: >-
  Research: bare-metal Raspberry Pi core (MicroPython/Arduino style, no heavy
  OS)
status: Done
assignee: []
created_date: '2026-10-07 09:57'
updated_date: '2026-10-07 10:11'
labels:
  - research
  - rpi
milestone: m-9
dependencies: []
ordinal: 99000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Background research (a sub-agent writes the analysis to the session scratchpad baremetal-pi/analysis.md): how to run Zinc on a Raspberry Pi 1 to 5 without a heavy OS — flash a minimal firmware once, then develop like on an ESP32 (upload ZBC over UART/USB/network or from the SD card, REPL/log over serial, GPIO/SPI/I2C/PWM, framebuffer, USB HID), foundations compared (Circle, own kernel, U-Boot loader, Ultibo, Zephyr, minimal Linux fallback), VideoCore firmware licence, QEMU raspi models for tests. Output: docs/reports/zinc-next-baremetal-pi.md and a roadmap of backlog tasks for a new rpi-baremetal target. Not on the critical path.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Research done by a sub-agent, committed as docs/reports/zinc-next-baremetal-pi.md; roadmap tasks created with labels rpi,baremetal,parked (ordinals 70000+). Open owner decision: Circle's GPLv3 (S0).
<!-- SECTION:NOTES:END -->
