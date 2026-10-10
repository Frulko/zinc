---
id: ZN-609
title: 'zinc test runs on a stock macOS: no GNU timeout needed'
status: Done
assignee: []
created_date: '2026-10-10 07:27'
updated_date: '2026-10-10 21:54'
labels:
  - cli
  - macos
  - bug
  - size-S
milestone: m-10
dependencies: []
priority: high
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found on the Intel Mac set up on 2026-10-10: src/test_cmd.cpp:98 runs every test file as `timeout <secs> ...` through std::system. Stock macOS has no `timeout`, so `zinc test` reports `sh: timeout: command not found` and fails every file (templates, example_output). 16 test scripts also call `timeout` (fuzz_regress, net, socket, device_modules, display_drivers, examples...). The machine works around it with ~/.local/bin/timeout -> gtimeout. Run the test file as a child process with a deadline (posix_spawn + waitpid with a poll, kill on expiry, keep exit 124 and the `timed out` label) and give the test scripts a portable helper (tests/run exports one, or a tiny tools/timeout in Python) instead of GNU coreutils.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `zinc test` in a project made by `zinc new cli` passes with no `timeout` on PATH
- [x] #2 a test file that never ends is reported `timed out` after ZINC_TEST_TIMEOUT (regression test)
- [x] #3 tests/run --tier t1 passes its timeout-using scripts with no GNU coreutils installed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (2026-10-10). zinc test runs each test file through runWithDeadline (src/test_cmd.cpp): fork, sh -c in its own process group, waitpid polled every 10 ms; past ZINC_TEST_TIMEOUT (now milliseconds as documented, was rounded to seconds) the group gets SIGTERM, then SIGKILL a second later, exit 124 and the 'timed out' label. tools/compat/timeout (Python, GNU timeout's contract: 124 on expiry, TERM then KILL, s/m/h suffixes, 127 when the command is missing, 128+signal) is put on the PATH by tests/run when there is no timeout; TESTING.md says so. AC1: a 'zinc new cli' project passes zinc test with PATH=/usr/bin:/bin. AC2: tests/t1/zinc_test_runners.sh runs a never-ending test-hang.ts with PATH=/usr/bin:/bin and ZINC_TEST_TIMEOUT=1000: 'FAIL ... test-hang.ts timed out', no orphan. AC3: the 24 scripts that call timeout run with a PATH where ~/.local/bin and /usr/local/bin are replaced by links to everything but timeout/gtimeout: 22 pass, tls and video fail for their known reasons (ZN-610 TLS 1.3, ZN-612 Apple Silicon golden), none says 'timeout: command not found'. tools/examples-status and tools/webgl-conformance use Python's own timeout. usage: n/a
<!-- SECTION:NOTES:END -->
