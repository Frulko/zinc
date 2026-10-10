---
id: ZN-638
title: console.log to a file or a pipe is block buffered until exit under zinc run
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 15:00'
updated_date: '2026-10-10 17:02'
labels:
  - devtools
  - size-S
milestone: m-20
dependencies: []
ordinal: 50260
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in ZN-613: 'zinc run app > log &' shows nothing while the app runs, because stdout is fully buffered when it is not a terminal (Node writes files synchronously and pipes per write). system_instance waited its full bound for a console.log line for that reason and now reads stderr. Flush stdout per line when it is not a terminal, or at each event-loop turn; measure the cost on a console.log loop (the jsonout kernel). Then look for other tests that poll a log for a console.log line and wait out their bound.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a console.log line of a running program is in the redirected file or pipe within one event-loop turn, in the interpreter, AOT and QuickJS, with a test
- [x] #2 console.log loop throughput to a file measured before and after, in docs/reports/zinc-next-perf.md
- [x] #3 tests that polled a log for a console.log line are listed and no longer wait their full bound
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause (not stdio buffering on the typed engine): the interpreter and the AOT programs append console.log to Machine::out, a string that report() writes at exit only, on a terminal as well as into a file or a pipe (measured: a program ticking every 300 ms showed its 5 lines together at exit, 1.2 s, in a pipe and on a pseudo terminal). Only QuickJS writes through stdio, block buffered when the output is not a terminal. So there is no single place for the three engines: the typed engines share Machine::out and hostRt (src/rt/rtcalls.cpp), QuickJS has its own two loops (src/qjs/qjs.cpp).
Fix: each event-loop turn writes what the program printed. Typed engines: hostRt calls Machine::flushOut() on host.evReady (the first host call of every turn of both prelude loops, __runLoop and __gfxLoop, through __pollHost) and on host.loopWait (before the loop sleeps, for what promise jobs and native callbacks printed after the poll). QuickJS: fflush(stdout) at the top of each turn of frameLoop and timerLoop.
Machine::outLive (new): the flush only happens when out is the standard output of the process, which runModule sets (zinc run, AOT programs, the wasm hosts: all end in report()). The hosts that keep the text for themselves go through vm::runHooked and stay as before: zinc profile and zinc mem (standard output is the report), the device core (the output is a frame of the upload protocol). Machine::lineMark replaces the function-static of the ZINC_STAMP_OUT stamp in vm.cpp, which pointed into text that a flush had removed (the same hazard existed after a console.error); the stamped output of a frame loop is byte-identical before and after.
Decision: per event-loop turn, not per line. Why: the criterion asks for one turn; a per-line write costs one write(2) per console.log in loops that never yield (what Node pays), needs three places (interpreter LogEnd, AOT LogEnd, QuickJS setvbuf) and would slow the batch programs the buffer was made for. Per turn costs nothing in a loop without an event loop and one write per turn that printed. Rejected too: writing before every host call (it would also order the parent's lines before a child's output and show a prompt before a blocking read, but it changes the stdout/stderr interleaving of every program that calls the host, with goldens captured 2>&1; proposed as a follow-up).
Side effects: a long running program no longer keeps all it ever printed in memory until exit; a program whose reader went away (zinc run app | head -1) now gets SIGPIPE at its next turn, as any Unix program, instead of running to its end.
Criterion 2, measured back to back on this build (alternating runs, median of 11, 21 for the first two rows; output to a file; load average 4.4 to 7.1 while other trees built, so the ratio is what counts). Before -> after:
- loop of 1,000,000 console.log lines, no event loop (11.9 MB): interpreter 98.1 -> 100.0 ms (1.02), AOT 62.4 -> 62.2 ms (1.00), QuickJS 2084.7 -> 2068.7 ms (0.99)
- jsonout kernel, interpreter (zinc run --interp, compile included): 26.3 -> 26.1 ms (0.99)
- 100,000 timer turns printing one line each: interpreter 1781.4 -> 2506.8 ms (1.41, +7.3 us a turn), AOT 1650.4 -> 2359.8 ms (1.43, +7.1 us a turn)
- 20,000 headless frames printing one line each: interpreter 422.0 -> 572.0 ms (1.36, +7.5 us a frame), AOT 338.6 -> 444.7 ms (1.31, +5.3 us), QuickJS 103.2 -> 204.7 ms (1.98, +5.1 us)
The cost is one write(2) per turn that printed something: 5 to 8 us, 0.05% of a 16.6 ms frame. Not written to docs/reports/zinc-next-perf.md here (worktree rule): the coordinator files these rows.
Criterion 3, the tests that wait on the output of a background run: system_instance (the only one that waited out its bound on a console.log line; since ZN-613 it reads a console.error line and stops as soon as it is there, nothing left to shorten, left unchanged: it is a test to run alone after integration), display_drivers (a stderr line of the display-remote plugin, returns at once), dev_mode (stderr lines of zinc dev), netlog (stderr), macos_deeplink and macos_vibrancy (files the app writes itself), macos_power (pmset), mapper (curl), osc (a fixed 0.5 s before the sender starts, not a log). None waits its full bound any more; no wait was changed.
Test: tests/t0/console_live.sh (6 s). The program prints a line in one turn and looks for it in its own output file in the next ones: interpreter, AOT and QuickJS timer loops into a file, the interpreter through a pipe with the real clock, the frame loop on the interpreter and on QuickJS (file and pipe), and zinc mem still gets the whole output on stderr. With the zinc binary built before the fix the 6 interpreter and QuickJS cases fail ("start turn not seen"); its AOT case passes because zinc build links the runtime library of the build directory, already fixed. AOT before and after was checked with a native program built before the change: its 5 lines came together at exit (1.63 s) through a pipe, and one every 300 ms after.
Run: console_live, run, aot, prof, qjs, host, osc, device, clock_real, sim_program, sim_replay, sim_compare, conformance, profile, quickjs, clock, socket, net, modules, frame_timer: all PASS. Not run: dev_mode and system_instance (fixed port, to run alone after integration), the full tiers.
For affected.json (not edited here): add console_live to the entry of src/rt/ and src/aot/, and an entry {"paths": ["src/qjs/qjs.cpp", "src/vm/vm.cpp", "tests/t0/console_live.sh"], "tests": ["console_live"]}.
Follow-ups to file (not created here, worktree rule): (1) write the machine's output before a host call that blocks or starts a child (zinc:process, stdin reads, sys.exit already does), so a prompt shows before the read and the parent's lines come before the child's; (2) Machine::flushErrLine and host.sysExit write Machine::out to the standard output also under zinc profile, zinc mem --json and in the device core, where the host keeps the output: a console.error or sys.exit there puts program text into the report or outside the protocol frame (was so before this task).
Usage: usage: n/a
<!-- SECTION:NOTES:END -->
