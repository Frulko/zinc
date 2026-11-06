---
id: ZN-1001
title: Measure and fix the worker loop leak
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-06 09:36'
updated_date: '2026-11-06 09:55'
labels:
  - size-S
  - perf
  - runtime
dependencies: []
ordinal: 760080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Read in the sidecar session: src/host/loop.cpp:30 may leak per worker or per message. Measure first: a zinc:worker program that starts/stops workers and posts messages for minutes, RSS sampled. Fix only if it grows.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Measurement recorded (RSS over time, before and after) in the task notes
- [x] #2 If it leaks: fixed in the engine with a regression test bounding the growth; if not: the reading is refuted in the notes and nothing is changed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured (headless, a worker started, 50 messages, terminated, next; ps RSS + lsof every 10 s). Before, interpreter: descriptors 7 -> 3091 in 50 s (1400 workers, ~2 per worker: the worker loop's KQUEUE and the DIR / that libuv's uv__async_start opens on macOS), RSS 13 -> 30 MB; QuickJS the same (8 -> 716 fds in 30 s). heap after 1000 workers: 9025 KB live, 8.2 MB of it in the W records' message deques (two 4 KB blocks a worker) kept in tOwned() for good. leaks: 0 unreachable (all reachable, never released).
Cause: src/host/loop.cpp kept each thread's uv_loop_t and its wake uv_async_t for the life of the process (the ponytail note at loop.cpp:30), and src/rt/worker.cpp kept a joined worker's record with its queues and module.
Fix: a thread_local ThreadLoop closes a non-main thread's loop at thread exit (uv_walk close, one NOWAIT round, uv_loop_close; the async and pump timer it allocated are freed in their close callback); terminate() and post() send the wake-up under the worker's lock so it never reaches a closed handle; join() frees the record's queues and module (the record stays as the handle's slot).
After, interpreter 3 min: 6000 workers, fds flat at 13, RSS 10.7-13.2 MB (residual ~0.4 KB a worker: the W slot); QuickJS 90 s: fds 16, RSS 26-29 MB flat. heap after 1000 workers: 994 KB live.
Proof: tests/t1/worker_churn.sh (200 workers on interpreter and QuickJS, fewer than 100 descriptors; ~10 s): old binary 411/414 descriptors, fails; new passes. worker_basic, worker_wire, worker_typed, worker_profile, busy_worker, worker_engines, host, heap_trim, net_limits pass.
<!-- SECTION:NOTES:END -->
