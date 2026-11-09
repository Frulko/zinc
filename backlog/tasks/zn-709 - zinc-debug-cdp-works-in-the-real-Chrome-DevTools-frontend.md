---
id: ZN-709
title: zinc debug --cdp works in the real Chrome DevTools frontend
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 23:37'
updated_date: '2026-11-09 05:24'
labels:
  - debugger
  - devtools
  - size-S
milestone: m-20
dependencies: []
ordinal: 11400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up of ZN-371.04: the Debugger and Runtime domains of zinc debug --cdp were checked with a scripted client (tests/cdp_debug_check.mjs), not with DevTools itself (js_app.html), which may ask for more (Debugger.setPauseOnExceptions, setAsyncCallStackDepth, Profiler/HeapProfiler enable, Runtime.getIsolateId, the scriptParsed fields it requires to show a file, the frames' functionLocation). Load devtools://devtools/bundled/js_app.html?ws=127.0.0.1:<port>/zinc-debug in headless Chrome (tools/cdp.py drives it) against tests/data/debug_cli/main.ts, check that the Sources panel lists main.ts, set a breakpoint through its UI, and read the Scope pane when it stops; fix what the frontend needs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the Sources panel of the real DevTools lists the program's files and stops at a breakpoint set in its UI (scripted headless Chrome)
- [x] #2 the Scope pane shows the locals of the paused frame
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (2026-11-09). Chrome 157's own frontend (devtools://devtools/bundled/js_app.html?ws=...) in headless Chrome, its WebSocket watched through Chrome's Network domain (webSocketFrameSent/Received) so every method it calls and every error it gets is logged. What it asked for on top of the scripted client: Network.emulateNetworkConditionsByRule must return ruleIds (the frontend read .length of undefined: an uncaught exception in sdk.js), Debugger.getPossibleBreakpoints must return locations (now the statements of those lines: the editor's inline marks), Runtime.getIsolateId an id; scriptParsed gains buildId (required by the protocol). The rest (Profiler.enable, setAsyncCallStackDepth, setBlackboxPatterns, Network.*) answer empty without harm. Explicit state (audit #10, CDP sessions): a Session has one Phase (Waiting, Running, Paused) changed by to(); stepping, getProperties and evaluate while running are refused with V8's error instead of being queued for the next pause, and requests left in the queue at a resume are answered with that error; each pause has a generation carried by call frame ids (<gen>:<i>) and object ids (scope:/closure:/globals:/obj:<gen>:<n>), so an id of an earlier pause is refused; a client that goes resets enabled and auto-attach, and a Debugger.enable on a paused program sends Debugger.paused again (DevTools closed and opened again shows the pause). Proof: tests/devtools_frontend_check.py sources (8 checks: main.ts in the navigator, a real click on line 19 of the gutter sets the breakpoint by URL, a click on Resume stops there, the Scope pane's Local shows total: 0, name: "zinc", v: 1, p: Point, a frontend opened again finds the pause and the locals, no error reply, no frontend exception; 3.5 s), tests/t1/devtools_frontend_sources.sh; tests/cdp_debug_check.mjs gains a stale scope id refused and stepOver while running refused; cdp_debug_check (main, --pause, --exprs) and cdp_worker_check pass. Interpreter only: zinc debug has no AOT or QuickJS debugger to keep in step. Research: protocol fields (https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/json/js_protocol.json: scriptParsed requires hash and buildId; CallFrame url still required), Hermes notes (https://cdpstatus.reactnative.dev/devtools-protocol/hermes/Debugger: always send data on exception pauses), the frontend's commands (https://chromium.googlesource.com/devtools/devtools-frontend/+/main/front_end/generated/InspectorBackendCommands.ts), its e2e helpers (https://chromium.googlesource.com/devtools/devtools-frontend/+/HEAD/test/e2e/helpers/sources-helpers.ts: addBreakpointForLine clicks the gutter, as the check does). usage: n/a
<!-- SECTION:NOTES:END -->
