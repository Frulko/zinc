---
id: ZN-566
title: >-
  QuickJS engine robustness for libraries (stack limit, rejection tracker, late
  onFrame)
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-09 08:11'
updated_date: '2026-10-10 22:06'
labels:
  - games
  - js
  - size-S
milestone: m-22
dependencies: []
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Three engine defects found by real libraries (src/qjs/qjs.cpp). (1) JS_SetMaxStackSize(8 MB) equals the macOS main-thread stack (ulimit -s 8176 KB): deep recursion overflows the native stack before QuickJS's check and the process dies with SIGSEGV instead of a RangeError; p5.js 1.11 dies while loading (a core-js feature test recurses and expects a catchable RangeError). Set the limit below the real thread stack, or run the engine on a thread with a bigger stack. (2) No promise rejection tracker: an exception in an async function nobody awaits vanishes (p5 2.x stopped after one frame without a message); print 'Uncaught (in promise)' and dispatch unhandledrejection. (3) The frame loop is chosen once after the synchronous part of the entry module: onFrame registered after a top-level await (PixiJS v8 `await app.init()`) is never called; enter the frame loop when onFrame is first registered. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 function f(){return f()+1} inside try/catch yields a caught RangeError and exit 0
- [x] #2 an unhandled rejection prints 'Uncaught (in promise)' with its stack and fires unhandledrejection when the web environment is on
- [x] #3 onFrame registered after await new Promise(r => setTimeout(r, 10)) receives frames
- [x] #4 p5.js 1.11.13 loads with the default stack
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-10, parallel agent (worktree), on the Intel Mac.

(1) Stack limit: the limit follows the thread's real stack. stackBudget() in src/qjs/qjs.cpp asks the system for the stack's low end (pthread_get_stackaddr_np / pthread_getattr_np, the twin of cStackLimit in src/rt/machine.cpp), takes what is left below the caller, leaves 1 MiB for the native code a script calls at its deepest (shader compiles, text shaping, JSON, regexp) and caps at the former 8 MiB; when the system does not say, QuickJS keeps its own 1 MiB. Scores (RULES 4: fit x3, performance x3, size x2, maintainability x2, licence x2, portability, effort): limit below the real stack 4,5,5,5,5,4,5 = 66; the same plus a larger main-thread stack at link time (-Wl,-stack_size on macOS, setrlimit and re-exec on Linux) 5,5,5,4,5,3,4 = 65; the engine on its own thread with a big stack 3,3,5,2,5,2,1 = 45 (SDL and Cocoa want the window and its events on the main thread, so every host call would cross threads). Measured, function f(){d++; return f()+1}: main binary exit 139 (SIGSEGV); fixed binary RangeError at depth 6,837 after 4.7 ms on the default 8 MiB stack (about 1 KiB of native stack per JavaScript frame), 2,925 at ulimit -s 4096, 484 at ulimit -s 1024, 7,824 at ulimit -s 65520 (the cap); JSON.stringify and a regexp run at the deepest frame. Chrome reaches about 11,000 frames with this function: a library that needs more is the case for the larger main-thread stack (follow-up below).

(2) Rejection tracker: JS_SetHostPromiseRejectionTracker records a promise rejected with no handler and forgets it when one is attached; drain() reports what is left once the jobs have run: 'Uncaught (in promise) <error>' and the stack on stderr. With no web environment the program ends with 101, as the typed engine (__checkRejections in src/frontend/modules.cpp) and Node do. A web environment sets globalThis.__zincUnhandledRejection(promise, reason): it dispatches unhandledrejection and returns true when a listener prevented the default; the message is then not printed, and in both cases the program goes on, as in a browser. The entry module's own promise is the program's uncaught exception ('Uncaught <error>', 101), which now also covers an exception after a top-level await (it vanished before). Criterion 2 stays open until ZN-568's window dispatches the DOM event through the hook (the hook itself is tested here).

(3) Late onFrame: the timer loop returns as soon as __zincFrameCb is a function and the frame loop takes over, its virtual clock starting where the timers left it (it restarted at 0).

(4) p5.js 1.11.13 (npm tarball p5-1.11.13.tgz, sha256 8f2c1e0e07b006c967d085154a6b92fd80906a9743373243944e4ea6cc737ec3, integrity equal to the registry's, kept outside the repository in /tmp/zn-jslibs): with the engine as it is today (no PromiseRejectionEvent, so core-js replaces Promise and recurses) lib/p5.min.js on the report's traced environment exits 139 on the main binary and prints 'p5 function 1.11.13' with exit 0 on the fixed one, default stack (ulimit -s 8192). With PromiseRejectionEvent present p5 loads on both and needs under 500 frames.

Tests: tests/t0/qjs_robust.sh (5 cases; all fail on the main binary, pass here); qjs, qjs_native, console_live (t0), quickjs, webgl_js, webgl1_core, webgl2_js, three, script, webgl_studio, webgl_gizmo, layout_bridge (t1) pass.
affected.json to add: {"paths": ["src/qjs/qjs.cpp"], "tests": ["qjs_robust", "qjs"]}.
Follow-up (not created): 'QuickJS: a larger main-thread stack for deep recursion' (size S): link zinc and built apps with a 64 MiB main-thread stack on macOS (-Wl,-stack_size,0x4000000), raise the 8 MiB cap of stackBudget with it, Linux through setrlimit before the engine starts; criteria: f(){return f()+1} reaches 50,000 frames before the RangeError, RSS of hello unchanged. Only if a library needs more than ~6,800 frames.
Not done: zinc:script contexts (src/qjs/script_native.cpp) keep QuickJS's 1 MiB default and take the user's 'stack' option as given; no rejection tracker there (a script's errors go to its host).

Criterion 2, second half (2026-10-11): ZN-568's window dispatches unhandledrejection through the hook; tests/t0/webenv.sh proves it (a PromiseRejectionEvent with the promise and the reason reaches a window listener, a prevented one prints nothing, the other prints 'Uncaught (in promise) Error: loud', exit 0).
<!-- SECTION:NOTES:END -->
