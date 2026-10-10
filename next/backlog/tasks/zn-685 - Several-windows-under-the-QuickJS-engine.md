---
id: ZN-685
title: Several windows under the QuickJS engine
status: Backlog
assignee: []
created_date: '2026-10-10 19:41'
labels:
  - desktop
  - qjs
  - size-S
milestone: m-27
dependencies:
  - ZN-663
ordinal: 444410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ZN-663 gave zinc:gfx openWindow / closeWindow / windowOpen and zinc:ui mountWindow on the interpreter and the AOT: the frame loop of kGfxModule (src/frontend/modules.cpp) runs each window's callback between __host_gfxBeginWindow and __host_gfxEndWindow. The QuickJS engine (src/qjs) brings its own frame loop: the rows exist there (isGfxTailRow) but no window callback runs. Port the loop (main callback unless the main window is closed, then each open window), so tests/t1/windows.sh passes with --engine quickjs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 tests/data/windows and tests/data/ui_windows print the same lines and frames under --engine quickjs as interpreted
<!-- AC:END -->
