---
id: ZN-1118
title: Terminate owned process descendants on timeout and shutdown
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-10 04:14'
labels:
  - system
  - ui
  - size-M
milestone: m-10
dependencies: []
ordinal: 10399
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Atelier774.31 starts a bounded zinc run --interp capture, but native plugin compilation or the sketch itself may spawn descendants. Existing zinc:process kill(pid) and shutdown only terminate the direct child, leaving descendants after timeout/owner close. Root fix belongs to process provider, not shell/pkill app workaround. Read all callers/public contracts before choosing minimal owned-process group/session/job lifecycle. Preserve direct/unowned PID semantics or validate ownership rather than blindly using kill(-pid) on arbitrary IDs; prevent stale handles/group reuse, clean descendants even leader exits, reap children. POSIX spawn groups and Windows Job Objects are proven APIs; native Windows behavior not claimed without machine. Primary short lookup https://pubs.opengroup.org/onlinepubs/9799919799/functions/posix_spawnattr_setpgroup.html and https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects . Existing Share worker source/task774.31 holds App/main CLI helpers, only plugins/process provider/tests belong to this task. No main.cpp/runtime/HAL/libstdUi edits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Owned spawned process families are terminated/reaped on kill timeout and provider shutdown, preserving public contract and refusing stale or unrelated group targets; no app shell workaround
- [ ] #2 Small bounded exact T0 child/grandchild and lifecycle regressions pass on available host, original Atelier capture/close path cleans up; untested platforms explicitly recorded
<!-- AC:END -->
