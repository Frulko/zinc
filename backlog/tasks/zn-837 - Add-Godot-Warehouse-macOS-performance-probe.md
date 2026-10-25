---
id: ZN-837
title: Add Godot Warehouse macOS performance probe
status: In Progress
assignee:
  - '@parallel'
created_date: '2026-10-25 15:25'
labels:
  - size-M
  - perf
  - macos
dependencies: []
ordinal: 546460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner request 2026-10-25: measure workflow performance on macOS first. Add an opt-in finite actual-window Warehouse probe with explicit warmup, frame/step/upload boundaries and idle versus updating UI workloads. Timed runs are coordinator-only on a quiet machine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Finite actual-window probe outputs versioned JSON for idle and updating UI workloads
- [x] #2 Frame interval and CPU boundaries are explicit and do not imply GPU completion time
- [x] #3 Smoke check validates output schema and clean shutdown without publishing loaded-machine timings
<!-- AC:END -->

## Implementation Notes

- Opt-in `--bench-frames 330 --bench-workload idle|active`; 30 warmup frames and 300 measured ordinary frames, no synthetic `_process` injection. Scene stays animated; active inventory is bounded 0..8.
- Versioned JSON documents CPU submission, previous Godot process-frame monitor, paced callback intervals, and scene initialization to first real frame. No GPU completion or total-process-CPU claim.
- `GODOT=/private/tmp/zinc-godot-tools/Godot.app/Contents/MacOS/Godot examples/godot-zinc-ui/bench-smoke.sh`: PASS for both workloads, 300 samples, 0 idle and 300 active uploads, exit 0. Headless timing values deliberately discarded.
- Existing `--self-test`: PASS native pixels, alpha, idle, state, focus, resize and teardown (exit 0).
- Coordinator owns actual-window interleaved measurements and final criterion #1 evidence; no GUI performance claim from this worker. No native build or shared surface modification.
- The optional editor import crashed in Godot extension documentation cleanup; ordinary game runs and clean benchmark teardown passed. No editor import is needed once the extension cache exists.
