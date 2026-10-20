---
id: ZN-709
title: zinc debug --cdp works in the real Chrome DevTools frontend
status: Backlog
assignee: []
created_date: '2026-10-10 23:37'
labels:
  - debugger
  - devtools
  - size-S
milestone: m-20
dependencies: []
ordinal: 484410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up of ZN-371.04: the Debugger and Runtime domains of zinc debug --cdp were checked with a scripted client (tests/cdp_debug_check.mjs), not with DevTools itself (js_app.html), which may ask for more (Debugger.setPauseOnExceptions, setAsyncCallStackDepth, Profiler/HeapProfiler enable, Runtime.getIsolateId, the scriptParsed fields it requires to show a file, the frames' functionLocation). Load devtools://devtools/bundled/js_app.html?ws=127.0.0.1:<port>/zinc-debug in headless Chrome (tools/cdp.py drives it) against tests/data/debug_cli/main.ts, check that the Sources panel lists main.ts, set a breakpoint through its UI, and read the Scope pane when it stops; fix what the frontend needs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 the Sources panel of the real DevTools lists the program's files and stops at a breakpoint set in its UI (scripted headless Chrome)
- [ ] #2 the Scope pane shows the locals of the paused frame
<!-- AC:END -->
