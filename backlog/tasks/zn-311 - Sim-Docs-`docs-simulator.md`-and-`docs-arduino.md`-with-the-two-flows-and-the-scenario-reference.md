---
id: ZN-311
title: 'Document zinc sim: board.json, scenarios, replay and esp32sim'
status: Backlog
assignee: []
created_date: '2026-10-07 13:14'
labels:
  - simulator
  - arduino
  - size-S
milestone: m-18
dependencies:
  - ZN-295
  - ZN-307
ordinal: 2600
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** One English page (no emojis) on board.json, the chip models, scenario steps, replay, esp32sim; its examples run in a T0 test; zinc help sim lists the steps.

From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-20). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1) the examples in the docs are run by a T0 test. 2) `zinc help sim` lists the steps. 3) English, no emojis.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. Docs for the simulator: `zinc sim`, board.json, scenarios, replay and the esp32sim emulator exist and have no guide (only docs/templates.md mentions zinc sim). Write one page, docs/guide or docs/targets, with a T0 test that runs its examples; the Arduino page waits for ZN-304. Evidence: tests/t0/sim_scenario.sh; docs/templates.md:36
<!-- SECTION:NOTES:END -->
