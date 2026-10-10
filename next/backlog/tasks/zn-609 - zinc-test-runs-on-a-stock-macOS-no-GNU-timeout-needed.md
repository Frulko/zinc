---
id: ZN-609
title: 'zinc test runs on a stock macOS: no GNU timeout needed'
status: Backlog
assignee: []
created_date: '2026-10-10 07:27'
updated_date: '2026-10-10 17:02'
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
- [ ] #1 `zinc test` in a project made by `zinc new cli` passes with no `timeout` on PATH
- [ ] #2 a test file that never ends is reported `timed out` after ZINC_TEST_TIMEOUT (regression test)
- [ ] #3 tests/run --tier t1 passes its timeout-using scripts with no GNU coreutils installed
<!-- AC:END -->
