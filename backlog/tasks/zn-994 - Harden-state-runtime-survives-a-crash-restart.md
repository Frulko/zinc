---
id: ZN-994
title: 'Harden state: runtime survives a crash-restart'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-06 07:23'
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
- [ ] #1 PollerJobs can start again after stop(): jobs enqueued after a crash-restart settle; regression test (deterministic mode does not hang)
- [ ] #2 crash()/restart unwinds in_frame, the half-begun gfx frame, hal_sdl in_watch and GenFrame::running so zrt_redraw and the event pump work after a restart; regression test
- [ ] #3 gl_replay paint_busy/stencil_ok restored on every exit path
- [ ] #4 gfx shot_watch clears when the request disappears; hal_sdl main_hidden is reset when the main window is shown again
<!-- AC:END -->
