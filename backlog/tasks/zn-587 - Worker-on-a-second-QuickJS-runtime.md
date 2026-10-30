---
id: ZN-587
title: Worker on a second QuickJS runtime
status: Backlog
assignee: []
created_date: '2026-10-09 08:12'
updated_date: '2026-10-30 15:50'
labels:
  - games
  - js
  - size-M
milestone: m-22
dependencies:
  - ZN-568
ordinal: 18400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Worker (module and Blob URL), postMessage with structured clone and transferable ArrayBuffers; OffscreenCanvas transfer later. Every library falls back when Worker is absent (PixiJS asset loading, Tone.js clock, three's DRACO/KTX2), so this is an optimisation, not a blocker. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PixiJS's worker texture loading (preferWorkers: true) works
- [ ] #2 Tone.js's Ticker uses the worker
- [x] #3 a worker crash is reported and does not stop the main loop
- [x] #4 zinc:worker runs on --engine quickjs (a QuickJS runtime per worker thread, typed messages as on the interpreter): worker_engines covers QuickJS and sprite-studio's live preview draws on QuickJS without its error message
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-30: sprite-studio (examples/sprite-studio) catches 'QuickJS has no workers yet' (src/qjs/prelude.cpp) and shows it in its preview window; the catch goes once this lands.
2026-10-30, #4 and #3 done: zinc:worker runs on --engine quickjs. Each worker is its own QuickJS runtime and context on its own thread (src/qjs/qjs.cpp runWorker), started and fed by the threads, queues and loop events of src/rt/worker.cpp through zn::host::workerBridge (include/zn/worker_bridge.h), so the profiler, the inspector's snapshot and the deterministic wait see them as on the interpreter.
Messages use the D173 record wire: the transform (src/qjs/strip.cpp workerTypesForJs) writes the schemas of `new Worker<In, Out>` and of `self.onmessage`'s MessageEvent<T> into the program, from the types of the file and of the files it imports by a relative path (frontend schemaOfType); src/qjs/worker_js.cpp encodes from the JS objects and decodes into the receiver's own type (fields by name, i32/u32 truncated, defaults), so worker_wire's subset receiver (sub.ts) matches. A type the schema text cannot name (the generic Envelope<T> of workerPort/parentPort, an interface that extends another, a type of zinc:system/window) gives '' on both sides and the message is QuickJS's structured clone (JS_WriteObject/JS_ReadObject). terminate() stops a busy worker through the runtime's interrupt handler (checked by hand: a `while (true)` worker ends at terminate()).
Proof: worker_engines (worker_basic and worker_wire on QuickJS equal expected.out), worker_basic, worker_wire, sprite_studio (the preview window on QuickJS is byte-equal to the interpreter's at frame 3; the 'no workers yet' catch is gone from examples/sprite-studio), multiwin, qjs, worker_profile: all PASS.
#3: worker_basic checks that a timer of the main program fires after the worker's crash went to onerror ('the main loop goes on'), on the interpreter, the AOT build and QuickJS.
Handover for #1 and #2 (PixiJS preferWorkers, Tone.js Ticker): they need the web environment's global Worker, which lib/std/webenv.js leaves out on purpose (its createImageBitmap comment, near line 854): a Worker class over __host_workerStart that accepts a Blob URL (the worker's source text: runWorker takes a file today), messages with '' schemas (structured clone, ArrayBuffer transfer), and a worker context with the web environment (self.addEventListener, postMessage, fetch, createImageBitmap). The runtime per thread is in place. Next command: `grep -n createImageBitmap lib/std/webenv.js`, then add the class and a test that loads a PixiJS texture with preferWorkers: true.
<!-- SECTION:NOTES:END -->
