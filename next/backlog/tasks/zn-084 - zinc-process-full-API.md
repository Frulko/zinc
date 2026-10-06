---
id: ZN-084
title: 'zinc:process full API'
status: Backlog
assignee: []
created_date: '2026-10-06 22:52'
labels:
  - host-modules
  - size-M
milestone: m-14
dependencies:
  - ZN-082
  - ZN-063
ordinal: 40260
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the 4-function handle API (spawn/read/status/kill) of src/frontend/modules.cpp by the prototype's: spawn(cmd, args, opts): Process, run(...): Promise<Result>, Process.onStdout/onStderr/onExit/write/closeStdin/kill(signal)/pid/exited/code, options cwd/env/stdin/shell/timeout. Keep the __host_proc* rows as the native layer; the atelier app moves to the full API.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 conformance tests/conformance/sys_process.ts passes with the prototype's expected output
- [ ] #2 examples/process/cli, process/sample and the atelier tests pass
- [ ] #3 audit 02 RC02 closed
<!-- AC:END -->
