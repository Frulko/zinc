---
id: ZN-1005
title: 'Headless runs: pace frames in real time on request'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:33'
updated_date: '2026-11-08 22:18'
labels:
  - headless
  - tools
  - size-S
milestone: m-10
dependencies: []
ordinal: 5900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A headless run without ZINC_DETERMINISTIC runs tens of thousands of frames a second, so a program waiting on threads, timers or the network ends before results arrive, and `ZINC_FRAMES` is no duration (ZINC_REALTIME does not pace). Make `ZINC_REALTIME=1` pace to the display rate (and let `ZINC_DURATION=ms` end the run) so screenshot and agent tooling is predictable.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-862: a headless run without `ZINC_DETERMINISTIC` runs its frames faster than real time, so a program waiting on threads or timers can end before their results arrive.
- music (2026-10-15): headless runs (ZINC_HEADLESS) run tens of thousands of frames a second, so a program waiting on the network needs ZINC_FRAMES of 200000 for a few seconds of wall time; a ZINC_REALTIME that paces headless frames would make scripted captures of networked programs simple.
- Headless runs: ZINC_REALTIME does not pace frames, so ZINC_FRAMES is not a duration for screenshot tooling.
- Headless runs with ZINC_SHOT: unless shots are taken often, frames run unthrottled, so `ZINC_FRAMES=300` ends before a 500 ms `setTimeout` fires; scripted inspector shots needed `ZINC_FRAMES=30000`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `ZINC_HEADLESS=1 ZINC_REALTIME=1 ZINC_FRAMES=60` takes about one second
- [x] #2 a `setTimeout(500)` fires before a 300-frame ZINC_SHOT run ends
- [x] #3 deterministic runs unchanged; docs/AGENTS env list updated
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (worktree agent, 2026-11-08).

Research (sonnet sub-agent): Godot separates real time from fixed-step fast runs (--fixed-fps, --write-movie, --quit-after counts frames); Unity's Time.captureFramerate fixes the step, targetFrameRate caps; Chrome headless has a virtual time budget. Sleep pacing pitfalls: sleeping a period after the work drifts, so use an absolute deadline (next += period) and reset it when more than a frame late instead of bursting; macOS sleeps can be late by a fraction of a millisecond. Link: https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html

Decision: opt-in, on ZINC_REALTIME=1 as the task says (it already meant the real clock for timers even in a deterministic run). The null HAL (targets/null/hal_null.cpp) paces hal_poll_input on an absolute deadline of 1/60 s, the same step as hal_fixed_dt, so a frame's dt and the wall clock agree; one place for the three engines (the typed engines and QuickJS all poll through HostGfxPoll). ZINC_DURATION=ms ends the run in the same HAL; without ZINC_FRAMES the frame budget is unbounded then (null HAL and HostGfxFrames in src/host/gfx_host.cpp). The default stays unpaced: benchmarks, captures and tests run headless non-deterministic for speed, and tests/run sets ZINC_DETERMINISTIC. Timer-only programs (no frame loop) are not ended by ZINC_DURATION (they never poll the HAL): use timeout.

Measured: REALTIME + FRAMES=70 exits in 1.2 s; the 500 ms timer fires at frame 29 of a 300-frame ZINC_SHOT run on the interpreter and QuickJS; the old binary never fired it.

Proof: tests/t0/headless_realtime.sh (about 6 s: frame 60 at 0.9-3 s on interpreter and QuickJS, the timer inside a 300-frame shot run, ZINC_DURATION=700 ends before frame 60, a deterministic 600-frame run under 5 s). Docs: AGENTS.md environment line, docs/guide/06-testing.md Captures, zinc help run.

Note: existing scripts that combine ZINC_REALTIME=1 ZINC_HEADLESS=1 with a large ZINC_FRAMES (inspector T1 tests, agent tests, device_screen, live_idle, quill_lab 400 frames, tests/demo/kanban_logic 20000 frames under timeout 30) now run at 60 frames a second instead of spinning: they end on their own or on their timeout, using far less CPU; kanban_logic relies on editor.ts quitting itself. To check at the milestone.
<!-- SECTION:NOTES:END -->
