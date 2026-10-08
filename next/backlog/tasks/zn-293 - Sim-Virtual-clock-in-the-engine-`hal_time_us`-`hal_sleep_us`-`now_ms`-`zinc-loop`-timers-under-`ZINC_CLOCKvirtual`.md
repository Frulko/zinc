---
id: ZN-293
title: >-
  Sim: Virtual clock in the engine: `hal_time_us`, `hal_sleep_us`, `now_ms`,
  `zinc:loop` timers under `ZINC_CLOCK=virtual`
status: Review
assignee: []
created_date: '2026-10-07 13:13'
updated_date: '2026-10-08 08:33'
labels:
  - simulator
  - arduino
  - size-S
milestone: m-18
dependencies:
  - ZN-292
ordinal: 53010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/hardware-simulator-and-arduino-interop.md (SIM-02). Wokwi-style board simulator (board.json superset of diagram.json, host-native backend on hw.h, QEMU second, `zinc sim` scenarios) and Arduino/ESP-IDF/PlatformIO interop (AOT --arduino and Zinc.h interpreter mode).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 1) a program sleeping 10 s in a loop prints the same output in under 200 ms wall. 2) the same program under `--clock real` is unchanged. 3) interpreter, AOT and QuickJS give the same virtual timestamps (T1).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. zinc --clock virtual|real (any command) sets ZINC_CLOCK: virtual makes the loop's timers, sleeps and Date.now advance a virtual clock (nothing waits), real forces real time even in a deterministic run. A 10 s x 3 sleeper prints the same 3 lines in under 200 ms on the interpreter (zbc), the AOT build and QuickJS (always virtual); tests/t1/clock.sh. Not done: hal_time_us/hal_sleep_us (display frame pacing) still read the host clock; the sim core's scheduler is not yet the clock source.
<!-- SECTION:NOTES:END -->
