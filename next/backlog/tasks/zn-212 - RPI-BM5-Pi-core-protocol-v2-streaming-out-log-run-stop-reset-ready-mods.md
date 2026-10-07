---
id: ZN-212
title: 'RPI-BM5 Pi core: protocol v2 (streaming out, log, run/stop/reset, ready mods=)'
status: Backlog
assignee: []
created_date: '2026-10-07 10:11'
labels:
  - rpi
  - baremetal
  - parked
milestone: m-11
dependencies: []
ordinal: 70050
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backward compatible extension of devproto.h so an event-loop program can be replaced without a power cycle. See docs/reports/zinc-next-baremetal-pi.md section 10.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 uploading while a program runs replaces it; --frames 60 ends deterministically; new device.sh (simulator) and QEMU cases
<!-- AC:END -->
