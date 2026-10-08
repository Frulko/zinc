---
id: ZN-296
title: 'Sim: Trace recorder and replay (`.zsim`)'
status: Done
assignee: []
created_date: '2026-10-07 13:13'
updated_date: '2026-10-08 11:20'
labels:
  - simulator
  - arduino
  - size-M
milestone: m-18
dependencies:
  - ZN-292
  - ZN-293
ordinal: 53040
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-05). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 1) record a scripted run, replay re-injects only inputs and the output trace hash is identical over 20 runs. 2) a modified model makes replay report the first diverging event with its time. 3) trace size under 1 MB for 60 s of the s3-matrix demo.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. zinc sim scenario.yaml --record run.zsim writes the trace of a run (inputs, console lines, one hash per frame; ZSIM format); --replay run.zsim re-injects only the inputs of the trace, runs the program again and compares its outputs event by event: ok N outputs, hash H (identical over 20 replays), or 'diverges at t=...' naming the first event that differs and what the run did instead (a changed colour of the die is found at the first frame that shows it). 60 s of the s3-matrix dice: 143 KB (3581 events), recorded in 0.9 s and replayed in 0.24 s. tests/t1/sim_replay.sh.
<!-- SECTION:NOTES:END -->
