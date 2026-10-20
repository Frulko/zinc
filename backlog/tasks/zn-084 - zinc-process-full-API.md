---
id: ZN-084
title: 'zinc:process full API'
status: Done
assignee: []
created_date: '2026-10-06 22:52'
updated_date: '2026-10-07 03:46'
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
- [x] #1 conformance tests/conformance/sys_process.ts passes with the prototype's expected output
- [x] #2 examples/process/cli, process/sample and the atelier tests pass
- [x] #3 audit 02 RC02 closed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. zinc:process is the plugin's index.ts again (spawn(cmd, args, opts): Process, run, onStdout/onStderr/onData/onExit, write, closeStdin, kill(signal), pid, exited), over plugins/process/native/process.next.ts and the libuv loop (separate stdout/stderr, stdin, cwd/env, events through the host event queue; exit reported after the output). The loop prelude delivers host events and stays alive while a child or stdin read is active (signal watches do not keep it alive). zinc:sys has real onSignal, kill (old messages), onStdin and poll(ms): conformance sys_process.ts equals the old output, added to t1 conformance (it needed pump() to poll with an active timer, since uv_run skips polling when no handle is active). Atelier moved to the full API. Met on the way: let x: Class without initializer, ternary of void calls (lowering crash that hid zed-editor). Examples: process/cli, process/shell, badge, zed-editor now run (44 OK).
<!-- SECTION:NOTES:END -->
