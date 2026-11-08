---
id: ZN-643
title: Write the program's output before a blocking host call
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 17:11'
updated_date: '2026-11-08 22:04'
labels:
  - runtime
  - size-S
milestone: m-20
dependencies: []
ordinal: 5400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ZN-638 (D65) writes console output at each event-loop turn. A host call that blocks or starts a child (zinc:process, a stdin read) still runs before what the program printed in the same turn is written. Flush the machine's output before such calls.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a prompt printed before a blocking stdin read is visible before the read
- [x] #2 the parent's lines come before the output of a child that inherits stdout
- [x] #3 a test on the interpreter and the AOT
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (worktree agent, 2026-11-08).

Research (sonnet sub-agent): C stdio and Python both need an explicit flush before fork/spawn (Python subprocess does not flush sys.stdout: common bug); C++ ties cin to cout so a read flushes the output first; Node writes files and TTYs synchronously but pipes asynchronously, so a child or exit can reorder or cut piped output. Links: https://nodejs.cn/api-v12/process/a_note_on_process_i_o.html, https://github.com/nodejs/node/issues/10617.

Decision: one list of host calls before which every engine writes the program's output, zn::flushesOutBefore in include/zn/runtime.h: the loop turn and wait (D65), plus stdinRead, procSpawn, procSpawnEx and procWrite (a blocking write to a child's stdin). The typed engines (interpreter and AOT share hostRt in src/rt/rtcalls.cpp) flush Machine::out there, QuickJS fflush(stdout) in hostFn. On QuickJS zinc:process runs the plugin's native code (posix_spawn), so process.host.cpp fflush(stdout) before posix_spawnp and before a blocking write, as C programs do before fork. Still no write before every host call (D65 rejected it). No API lets a child inherit stdout today (all children get pipes; spawnLine merges into a pipe): criterion 2 is proven with a child that appends to the file the program's output goes to, which is the same ordering.

Engine gap found and fixed: onStdin of zinc:sys failed on QuickJS (__host_stdinRead not installed: HostStdinRead was missing from isSysTailRow).

Proof: tests/t0/output_before_block.sh (interpreter, AOT, QuickJS: the program finds its own line in its output file right after spawn() and after onStdin(); the old binary says no on all six); console_live passes.

later.md: zinc:process has no stdio: 'inherit' option (Node's spawn has it): a child that should print to the terminal (git, a build tool) needs its output copied line by line.
<!-- SECTION:NOTES:END -->
