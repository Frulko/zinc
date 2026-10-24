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
ordinal: 274000
updated_date: '2026-10-25 01:53'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: dropped. Deploy and dev loop over the USB gadget: superseded by `zinc agent` / `zinc device` (pairing, deploy, dev --device, OTA; src/agent) which work on any Linux ARM machine over the network; a CHIP needs the agent running, not a second protocol. Evidence: src/agent/dev.cpp; tests/t1/agent_deploy.sh; tests/t1/agent_dev.sh Verifier: zinc agent / zinc device already do deploy and dev --device over the network (src/agent/dev.cpp, tests/t1/agent_deploy.sh, agent_dev.sh), and the CHIP's ECM gadget is a network (10.43.43.1); the ACM bytecode upload is a second protocol for one board. Stock NTC 4.4 compatibility of the agent is a cross-pass check.
<!-- SECTION:NOTES:END -->
