---
id: ZN-994
title: 'Harden state: runtime survives a crash-restart'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-06 07:23'
updated_date: '2026-11-06 07:39'
labels:
  - size-M
  - runtime
  - hardening
dependencies: []
ordinal: 753080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/implicit-state-machines.md (#1, #2, R4, T3, R6). After a crash longjmp and restart, flags set during the frame are never unwound and job workers stay quit. Reproduce first.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 PollerJobs can start again after stop(): jobs enqueued after a crash-restart settle; regression test (deterministic mode does not hang)
- [x] #2 crash()/restart unwinds in_frame, the half-begun gfx frame, hal_sdl in_watch and GenFrame::running so zrt_redraw and the event pump work after a restart; regression test
- [x] #3 gl_replay paint_busy/stencil_ok restored on every exit path
- [x] #4 gfx shot_watch clears when the request disappears; hal_sdl main_hidden is reset when the main window is shown again
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced first, each case alone (tests/t0/zrt_restart.sh builds runtime/zrt.cpp with ZRT_CRASH=2 and the null HAL; tests/t1/video_layers.sh mode cancel).
- Reach: the crash longjmp exists only under ZRT_CRASH!=0 through zrt::app_main, and no build path sets ZRT_CRASH or calls app_main (zinc.json "crash" is accepted but ignored; docs/dev-mode.md still documents it). The shipped engine exits on a panic. The test turns the policy on to prove the runtime's own path.
- #1 Jobs (runtime/zrt_jobs.h, the report's PollerJobs): reproduced, a job after teardown never settled (deterministic poll hangs). stop() now drops the queued jobs, fixes running_ and clears quit_, so the next run() starts a worker that works. Also reached without a crash: HostGfxFinish -> finish_run -> teardown stops every Jobs, then any later job never settled.
- #2 in_frame: the claim "zrt_redraw dead forever" is wrong, the next loop frame clears it; reproduced only for redraws before the first frame after the restart. guarded() clears in_frame on the longjmp. The half-begun gfx frame needs no unwinding: begin_frame starts its buffer, the compositor depth and the transform over. hal_sdl in_watch and GenFrame::running: not reachable (the longjmp never happens in a build that links hal_sdl; a crashed generator belongs to the abandoned run), skipped.
- #3 gl_replay paint_busy/stencil_ok: already restored on every path (the only early return, the incomplete framebuffer, comes before both are touched; run() does not longjmp). Skipped.
- #4 shot_watch: reproduced (request emptied between frame 10 and 13: the picture stayed off its layer for good); an empty request now clears the watch. main_hidden: nothing ever shows the main window again once its close hid it (no API, no SDL show path), so the state is terminal by design; skipped.

Tests: tests/run --only zrt_restart (fails on the old runtime: settled 0, redraws 0), video_layers (cancel step fails on the old binary), ipod_plugin, timers_wall_clock, shell_plugin, device_screen: pass. #3 and the in_watch/GenFrame/main_hidden parts of #2 and #4 are ticked as checked-not-reachable (see above), not changed.
<!-- SECTION:NOTES:END -->
