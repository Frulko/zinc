---
id: ZN-613
title: >-
  system_instance fails when a cold zinc run compiles for longer than its 10 s
  wait
status: Done
assignee: []
created_date: '2026-10-10 07:27'
updated_date: '2026-10-10 14:58'
labels:
  - test
  - flaky
  - size-S
milestone: m-16
dependencies: []
priority: low
ordinal: 168040
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tests/t1/system_instance.sh gives the first instance 10 s to print `first instance`. It runs under an empty HOME, so that first `zinc run` compiles the program: 74 s wall (194 s CPU) on the Intel Mac while Homebrew built in parallel, 0.2 s once cached. The second instance then starts first, takes the lock and the test fails (`second instance: 'first instance ...'`). It passed on the same machine when idle. Warm the program before the race (a first run or `zinc build` under the same HOME) or wait on a readiness file with a longer bound.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 system_instance passes while another build loads every core
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: the test waited on the line 'first instance' in the first instance's log, but console.log into a file is flushed only at exit, so the line never arrived and the wait was always the full 10 s. Under an empty HOME the first zinc run builds the system plugin with a cold zig cache (20 s idle, 52 s at load 4, 100 s and more when every core is busy; a cached start is under 1 s), so past 10 s the second instance started first and took the lock.
Fix (test only, next/tests/t1/system_instance.sh): the first instance says 'first instance' on stderr (unbuffered), and ready() waits for that line or for the process to end, with a count that only stops a hung run; the program's own timer (120 s) only ends a failed run. No engine or plugin change.
Decision: wait on a real readiness line rather than warm the cache, because warming needs a run that takes the lock; stderr rather than the socket file, because a stale socket is part of what the test checks.
Measured, with the main tree's zinc: before the fix under 16 busy loops (load 26 to 61) 1 pass, 1 fail of 2; after the fix PASS at load 107 (112 s), PASS twice under 16 busy loops at load 100 to 160 (191 s, 149 s).
Follow-up to create (not created here, worktree rule): console.log to a file or a pipe is block buffered until exit under zinc run (Node writes files synchronously); a program run as 'zinc run app > log &' shows nothing while it runs. Flush stdout per line when it is not a terminal, or at each turn of the event loop.
Usage: usage: n/a
<!-- SECTION:NOTES:END -->
