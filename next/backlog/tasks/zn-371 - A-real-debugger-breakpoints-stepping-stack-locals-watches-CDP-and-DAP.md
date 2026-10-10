---
id: ZN-371
title: 'A real debugger: breakpoints, stepping, stack, locals, watches (CDP and DAP)'
status: Backlog
assignee: []
created_date: '2026-10-08 15:16'
updated_date: '2026-10-10 22:32'
labels:
  - devtools
  - debugger
  - size-L
milestone: m-20
dependencies: []
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-10-08: a real debugger as a module. The interpreter gains line tables and a debug hook (ZBC carries source positions already for traps): breakpoints (line, conditional, logpoints), step over/into/out, pause on exceptions, call stack, scopes with locals and closures, evaluate a watch expression (typed, through the checker), source maps for TSX. Exposed as the CDP Debugger and Runtime domains (Chrome DevTools Sources panel) and as a Debug Adapter Protocol server for VS Code (`zinc debug`). Costs nothing when no debugger is attached; AOT programs debug through native debuggers with #line directives.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 VS Code stops at a breakpoint in a .tsx file, shows locals and steps (scripted DAP test)
- [ ] #2 Chrome DevTools' Sources panel does the same over CDP
- [ ] #3 an attached-but-idle debugger keeps the interpreter within 5% of its speed (bench), none attached 0%
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Split on 2026-10-11 into ZN-371.01 (interpreter debug core and zinc debug on the command line, D84), .02 DAP for VS Code, .03 .tsx positions, .04 CDP Debugger domain, .05 conditions, logpoints, watches, exceptions, closures and globals, .06 AOT in lldb. The subtasks take the parent's place in the order (ordinals 25001-25006).
<!-- SECTION:NOTES:END -->
