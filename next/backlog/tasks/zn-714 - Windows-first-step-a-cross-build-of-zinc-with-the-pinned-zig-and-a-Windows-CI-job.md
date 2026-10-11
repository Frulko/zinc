---
id: ZN-714
title: >-
  Windows, first step: a cross build of zinc with the pinned zig and a Windows
  CI job
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-11 16:08'
labels:
  - windows
  - size-L
milestone: m-12
dependencies: []
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 zinc build --target windows-x86_64 of a console program links with the pinned zig; what does not compile is listed by module
- [ ] #2 a CI job on a Windows runner builds zinc natively or runs the cross-built program and its T0 tests; the workflow file is committed, pushing it is the owner's step
- [ ] #3 the list of what a window, a file dialog and an installer need on Windows is written as lines for next/backlog/later.md
<!-- AC:END -->
