---
id: ZN-221
title: 'zinc repl for devices (device-sim, agent)'
status: Backlog
assignee: []
created_date: '2026-10-07 10:11'
labels:
  - rpi
  - baremetal
  - parked
milestone: m-11
dependencies: []
ordinal: 90300
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** The host compiles one line to a ZBC module and uploads it to device-sim or a paired device through the agent; state of earlier globals is decided (keep a persistent module scope). Proof: T1 test on device-sim.

The host compiles one line to a ZBC module and uploads it. See docs/reports/zinc-next-baremetal-pi.md section 10.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 works on the simulator and QEMU first; the access to earlier globals is decided
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. A zinc repl does not exist (no src hit) and would be useful for makers and education, but the text is about bare-metal QEMU. Re-aim it at the device-sim/ESP32 simulator and the device agent.
<!-- SECTION:NOTES:END -->
