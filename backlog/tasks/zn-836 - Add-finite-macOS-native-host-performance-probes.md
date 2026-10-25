---
id: ZN-836
title: Add finite macOS native-host performance probes
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-25 15:25'
labels:
  - size-M
  - perf
  - macos
dependencies: []
ordinal: 545460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request 2026-10-25: measure workflow performance on macOS first. Add opt-in finite measurement modes to Swift Observatory and the LibGodot host: startup readiness, externally driven ticks, draw/copy costs, idle/active scenario and clean shutdown. Existing default behavior unchanged; reuse native runtime profiler and common sampler.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A finite no-focus measurement mode exposes frame/tick samples and readiness for Swift and LibGodot
- [x] #2 Idle and animated or interactive behavior are labelled and all processes exit cleanly
- [x] #3 Tests prove probe parsing and lifecycle without publishing timings under concurrent builds
<!-- AC:END -->

## Implementation Notes

- Both native executables accept `--bench-frames 31..360 --bench-workload idle|active`; canonical measurement is 330 total ticks (30 warmup, 300 samples). The mode forces background activation policy, emits flushed `workflow ready`, preserves raw monotonic microsecond host tick intervals and work spans in a single schema-1 `workflow bench json: ` record, then destroys the runtimes and exits.
- Swift idle pauses orbital simulation. LibGodot idle pauses the actual GDScript game; its existing renderer/redraw behavior is retained. Timing spans cover Swift Zinc tick and pixel-copy/CGImage conversion, or Godot iteration and Zinc tick/presentation submission. They are host wall durations, not GPU completion or displayed-frame FPS. Startup clocks begin at native host entry and explicitly identify native image/view readiness scope.
- Both native hosts built against the main tree's existing app-library manifest (`BUILD=/Users/mowmow/Lab/zinc/build`); no full engine or LibGodot source rebuild. Swift build now honors BUILD consistently with tools/link-embedded.
- `tests/demo/native_host_bench.sh` passed: invalid options fail before windows, actual native idle/active runs each exit cleanly after 31 ticks, readiness occurs once, warmup leaves one sample, and both JSON records parse with the expected schema/scopes. Root granted the GUI slot; numbers from these concurrent-build lifecycle checks were discarded. `git diff --check` passed. Root coordinates quiet-machine 330-tick runs and external CPU/RSS/footprint sampling.
- No cross-platform tests, GPU completion claim or timing injection.
