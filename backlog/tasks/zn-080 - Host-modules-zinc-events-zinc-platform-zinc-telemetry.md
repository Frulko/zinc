---
id: ZN-080
title: 'Host modules: zinc:events, zinc:platform, zinc:telemetry'
status: Done
assignee: []
created_date: '2026-10-06 22:51'
updated_date: '2026-10-07 02:46'
labels:
  - host-modules
  - size-S
milestone: m-14
dependencies: []
ordinal: 40220
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pure Zinc where possible: zinc:events (Emitter, once, off, listenerCount) from lib/modules.d.ts:144-195; zinc:platform (constants from the run profile and the window: TOUCH, KEYBOARD, POINTER, SCREEN_W/H, DPR, NAME, plus the platformModule of compiler/src/capabilities.ts:75); zinc:telemetry (connect/counter/gauge/event/expose/enabled, ZINC_TELEMETRY sink, same line protocol as runtime/mod/telemetry.cpp). Declare them in the module table (kStd or built-in sources) and document capability per target.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 T0 fixtures for each module; telemetry output equals the prototype's byte for byte for a scripted session
- [x] #2 examples/native-module and iot-panel pass the module-resolution step for these three
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. zinc:events, zinc:platform (from targets/capabilities.json), zinc:telemetry as built-in Zinc sources; the telemetry lines equal the old simulator's byte for byte except ts and the platform name (tests/golden/host/telemetry.expected); events fixture. native-module and pinball now run (promoted in tests/examples.lst); iot-panel resolves all three and stops on zinc:gpio. Limits: udp:// sink, perf_frame and log messages, 10 Hz sampler (done on telemetry calls).
<!-- SECTION:NOTES:END -->
