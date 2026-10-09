---
id: ZN-516
title: Deploy and dev loop over the USB gadget (ssh and device core)
status: Backlog
assignee: []
created_date: '2026-10-09 07:40'
labels:
  - chip
milestone: m-24
dependencies:
  - ZN-513
  - ZN-515
ordinal: 320040
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc deploy --target chip over ssh (10.43.43.1 on the ECM gadget or Wi-Fi) starts the program detached and tails its log; zinc dev hot reload over ssh; cross-build the device core (src/dev, upload protocol of the ESP32) for armv7-linux and run it as a service on /dev/ttyGS0 so zinc run --target chip --port /dev/cu.usbmodem* uploads bytecode without ssh. (From docs/reports/hardware/ntc-chip.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 deploy and start of hello on a CHIP takes under 10 s and returns the prompt
- [ ] #2 zinc run --target chip --port uploads and runs bytecode through the ACM gadget
- [ ] #3 works against the stock NTC 4.4 image (g_serial gadget, static binary) and against Debian trixie
- [ ] #4 the same flow passes against the CHIP-03 simulator over EMAC user networking
<!-- AC:END -->
