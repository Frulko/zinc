---
id: ZN-481
title: 'Device protocol over TCP: upload bytecode to a running handheld core'
status: Backlog
assignee: []
created_date: '2026-10-09 07:38'
labels:
  - dev
  - handheld
  - handhelds
  - size-M
milestone: m-23
dependencies:
  - ZN-458
  - ZN-462
ordinal: 55800
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-11-07:** Keep: T0 of the protocol over TCP against device-sim; refused or corrupt upload leaves the core usable. Physical handheld goes to the cross pass.

Run zn::dev::Core (include/zn/devproto.h) over a TCP socket in the handheld cores so zinc run --target <t> --device <ip> uploads a .zbc into the running core and streams its output, as zinc run --target esp32 does over serial.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 T0 test of the protocol over TCP against zinc device-sim
- [ ] #2 an upload and run works on at least one physical handheld (noted) and in one emulator with networking
- [ ] #3 a refused or corrupt upload leaves the core usable
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: rewrite. Device protocol over TCP for handhelds; provable as a T0 against zinc device-sim. Drop the physical handheld criterion.
<!-- SECTION:NOTES:END -->
