---
id: ZN-644
title: >-
  console.error and sys.exit leak program output to stdout under profile, mem
  and the device core
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 17:11'
updated_date: '2026-11-09 00:17'
labels:
  - runtime
  - bug
  - size-S
milestone: m-20
dependencies: []
ordinal: 8100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in ZN-638, older than it: flushErrLine and host.sysExit write Machine::out to stdout whatever the host is, so `zinc mem --json` or `zinc profile` of a program that calls console.error mixes the program's output into the report, and the device core's out frame misses it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc mem --json of a program that calls console.error prints only the report on stdout
- [x] #2 the device core's out frame holds the whole output
- [x] #3 a regression test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (worktree agent, 2026-11-09).

Web search (sonnet): every exit path should go through one sink, never fd 1 directly (Node's process.exit loses piped stdout: https://notes.billmill.org/programming/javascript/node/Node_stdout_is_async.html); report tools keep their report apart from the program's output (valgrind --log-fd, https://man.archlinux.org/man/valgrind.1.en); flush stdout before writing stderr to keep the order (https://lore.kernel.org/all/xmqqtufu2pll.fsf@gitster.g/T/).

Fix: Machine::outLive already says whether `out` is the process's stdout. When it is not (zinc mem, zinc profile, the device core of src/dev), flushErrLine keeps the console.error line in `out`, in order (the host writes it: zinc mem/profile to stderr, the device core in its out frame), and host.sysExit ends the run with "exit <n>" as a player or a worker does instead of std::exit, so the host still prints its report and the code. Result::exitCode() reads it; the profiler host, the device core and rt::report return that code. zinc debug now runs with outLive (its `out` is the terminal's, as zinc run's), so its console.error still goes to stderr live and exit still ends the process.

Proof: zinc mem err.ts --json: stdout valid JSON, stderr a b c; with sys.exit(3): exit 3, JSON intact; zinc run ex.ts --target esp32 --device 'zinc device-sim': stdout a b c, exit 3 (before: the lines went to the device's raw stdout, the protocol channel). zinc run unchanged (a, c on stdout, b on stderr, exit 3, interpreter and native). Tests: tests/t0/device.sh and tests/t0/prof.sh extended; both pass, with output_before_block.

Proposed tests: tests/t1 device_modules.sh (device-sim with the board modules), a zinc debug session (tests/dap_check.py) of a program calling console.error and sys.exit.
<!-- SECTION:NOTES:END -->
