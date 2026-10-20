---
id: ZN-636
title: HAR written on SIGTERM or periodically
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 14:28'
updated_date: '2026-10-10 16:58'
labels:
  - devtools
  - size-S
milestone: m-20
dependencies: []
ordinal: 50230
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zinc run --har writes the file at normal exit only: a killed program leaves none. (Follow-up of ZN-370, D60.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 kill of a zinc run --har leaves a valid HAR
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done in a parallel worktree (branch worktree-agent-a0700e36f27b616d0), on top of ZN-633 and ZN-635.

What changed
- src/host/netlog.cpp: the HAR file follows the log while the program runs. tick(sleepMs) rewrites it when the log changed (a dirty flag set by open() and by find(), through which every other call reaches its entry): at most once a second, less often when a write is slow (the next one waits 20 times the time the last took, so under 5% of the time), and always before a sleep that would outlast that second. Each write is whole, to <file>.tmp, then renamed over the file: what is on disk is a valid HAR at every moment. The first tick writes an empty log, so a program killed before its first request leaves a file too. The write at normal exit stays (and falls back to writing in place when the path cannot be renamed over, e.g. /dev/stdout).
- src/host/loop.cpp: pump() and wait(ms) call netlog::tick (two flag tests when ZINC_HAR is not set).
- Tests: new tests/t0/netlog_kill.sh; tests/netlog_check.py also checks that the HAR on disk lists the 9 requests while the UI program still runs. docs/dev-mode.md (HAR export) and netlog.h say it.

Decision (no record number, for the coordinator; D60 should lose 'The HAR is written at normal exit only')
Periodic write, no signal handler. Options: (a) a SIGTERM handler that writes the file: building the HAR allocates, which is not allowed in a signal handler (a kill during malloc would deadlock); through libuv's signal watcher it is safe but the process then only dies on its next loop turn, so a hung program started with --har would ignore kill and timeout, and SIGKILL or a crash still leave nothing. (b) a libuv repeating timer: it wakes loop::wait early, and the prelude runs the due Zinc timer right after wait returns when no outside work is pending, so a setTimeout would fire up to a second early under --har. (c) a check on the loop turns that already happen (pump every frame and every turn of the timer loop, wait before sleeping): no new wake-up, covers SIGTERM, SIGKILL and crashes; the price is a file up to about a second behind. Chosen: (c).

Proof (development Mac)
- AC1: tests/run --only netlog_kill -> PASS; run directly: 'netlog_kill: ok (a valid HAR after SIGTERM and after SIGKILL)' (a program that fetches once then idles; the file lists the request while it runs; after kill and after kill -9 it parses as HAR 1.2 with that request and status 200).
- The test fails without the change: with the binary of the main tree (before this commit, read only) it exits 1 with 'SIGTERM left no valid HAR with the request' and 'SIGKILL left no valid HAR with the request'.
- tests/run --only netlog -> PASS (UI program under the frame loop: the HAR on disk lists the 9 requests before the program is asked to quit). Also PASS socket, mqtt, net (programs on the same loop, ZINC_HAR not set).

Not measured: the cost of rewriting a large log (the 5% bound is by construction, from the measured duration of the last write). Not proven: a compiled (AOT) run; the code is the same host library.

For the coordinator
- affected.json: add netlog_kill to the row of src/host/netlog.cpp; src/host/loop.cpp has no row (a change there falls back to every test).
- No follow-up task needed. If a second is too coarse one day: an option for the period (ZINC_HAR_EVERY); not added, nobody asked.

usage: n/a (tools/usage)
<!-- SECTION:NOTES:END -->
