---
id: ZN-566
title: >-
  QuickJS engine robustness for libraries (stack limit, rejection tracker, late
  onFrame)
status: Backlog
assignee: []
created_date: '2026-10-09 08:11'
labels:
  - games
  - js
  - size-S
milestone: m-22
dependencies: []
ordinal: 345270
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Three engine defects found by real libraries (src/qjs/qjs.cpp). (1) JS_SetMaxStackSize(8 MB) equals the macOS main-thread stack (ulimit -s 8176 KB): deep recursion overflows the native stack before QuickJS's check and the process dies with SIGSEGV instead of a RangeError; p5.js 1.11 dies while loading (a core-js feature test recurses and expects a catchable RangeError). Set the limit below the real thread stack, or run the engine on a thread with a bigger stack. (2) No promise rejection tracker: an exception in an async function nobody awaits vanishes (p5 2.x stopped after one frame without a message); print 'Uncaught (in promise)' and dispatch unhandledrejection. (3) The frame loop is chosen once after the synchronous part of the entry module: onFrame registered after a top-level await (PixiJS v8 `await app.init()`) is never called; enter the frame loop when onFrame is first registered. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 function f(){return f()+1} inside try/catch yields a caught RangeError and exit 0
- [ ] #2 an unhandled rejection prints 'Uncaught (in promise)' with its stack and fires unhandledrejection when the web environment is on
- [ ] #3 onFrame registered after await new Promise(r => setTimeout(r, 10)) receives frames
- [ ] #4 p5.js 1.11.13 loads with the default stack
<!-- AC:END -->
