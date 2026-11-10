---
id: ZN-587
title: Worker on a second QuickJS runtime
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-09 08:12'
updated_date: '2026-11-10 09:20'
labels:
  - games
  - js
  - size-M
milestone: m-22
dependencies:
  - ZN-568
ordinal: 16600
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-11-07):** Finish web Worker facade for Pixi preferWorkers and the Tone.js ticker; remove the sprite-studio catch.

Worker (module and Blob URL), postMessage with structured clone and transferable ArrayBuffers; OffscreenCanvas transfer later. Every library falls back when Worker is absent (PixiJS asset loading, Tone.js clock, three's DRACO/KTX2), so this is an optimisation, not a blocker. (From docs/reports/games/js-game-libraries.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 PixiJS's worker texture loading (preferWorkers: true) works
- [x] #2 Tone.js's Ticker uses the worker
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
Review 2026-11-07: done-partly. zinc:worker runs on QuickJS; the PixiJS preferWorkers and Tone.js Ticker criteria remain, plus removing the sprite-studio 'no workers' catch (src/qjs/prelude.cpp). Evidence: src/qjs/qjs.cpp runWorker; src/rt/worker.cpp; AC3 and AC4 ticked
Review 2026-11-07, from backlog/later.md: Workers (D183): QuickJS workers need one JSRuntime per thread (gMapFile, gTraceName, napi per thread) and a record codec in JS; then the untyped `Worker` for JS libraries.

2026-11-10 (parallel work/587): completed the web Worker facade on the existing per-thread QuickJS runtime and worker bridge. The source is an owned in-memory WorkerSource payload (explicit classic/module/file/source kind), separate from the short inspector URL. File module imports use the existing resolver; Blob source is captured before URL revocation. No temporary source files, native registry, DOM or drawing surface are created in workers. Typed zinc:worker is preserved; its schema-free clone now preserves references.

Research (primary sources): WHATWG Workers and messaging specify synchronous clone/transfer validation and sender detachment only after accepted serialization: https://html.spec.whatwg.org/multipage/workers.html and https://html.spec.whatwg.org/multipage/web-messaging.html . Pinned Pixi 8.22.0 shipped source (third_party/pixi/pixi-8.22.0.min.mjs, SHA256 66257bc46776898bf8c54daaed402ed8f9ac109379c47b2dfa8aa048544d2953) uses a Blob probe plus Blob texture worker, fetch/blob/createImageBitmap, events and ImageBitmap transfer. Tone 15.1.22 actual Ticker source https://unpkg.com/tone@15.1.22/build/esm/core/clock/Ticker.js (SHA256 f6eff8f0313a534a170ee6254424e9c138ecd8f4de778c68d70beacbabb2a9dd) needs Blob source, self.onmessage, timers and postMessage. Reused the existing Web events/fetch modules and image decoder/shim; no dependency added.

The web codec snapshots graph data once, keeps cycles/shared aliases, Map/Set/Date/RegExp, typed arrays/ArrayBuffer, Error name/message/stack/cause, Blob and ImageBitmap, and reports unsupported values as DataCloneError. Transfer arrays/options validate duplicates, detached buffers and unsupported values before acceptance; queue refusal preserves buffers/bitmaps. Bitmap pixels are revived on the receiver's own prototype. Main HTMLImageElement and createImageBitmap share their existing decoder inbox pump. Each direction is bounded to 256 messages/16 MiB encoded bytes; pop releases capacity, termination/join clear both queues and counters. Handles remain the bridge's monotonic slots. Parent facade has one explicit enum/transition path.

Narrow coordinator-approved provider fix: permissions.cpp now locks configure/enforced/check (including warn-once); sys_host.cpp locks filesystem scope/grant readers and setters. Scope lock precedes permission lock; no provider callback or dialog runs under either. Worker file and HTTP fetch still use the existing permission-checked host rows. A declared empty enforced manifest refuses both file and network access in the exact regression.

Proof on final engine SHA256 ea4253e06de004056a09e4e874b1ae859b2f26f6c1842df10cfdf5ae66969bf6: tools/build zinc PASS, warning-free incremental final build. Exact T0 web_worker PASS (classic file/Blob, module file/import/relative fetch and Blob module, cycles/aliases, Error cyclic cause, transfers both ways, empty/detached/duplicate/invalid transfer, failed clone retention, count overflow retention, byte budget reuse, crash/main continuation, repeated terminate, enforced permission denial, concurrent host manifest/check/reset and warning once). Exact T0 system_drop_scope PASS, including concurrent real filesystem reads/grants. Original worker_basic on QuickJS and interpreter byte-equal expected.out. Actual pinned Pixi 8.22.0 created its two workers and returned original 32x24 ImageBitmap with red pixel 220,30,30,255; actual Tone Ticker remained type worker, delivered two ticks, and disposed. Original pinned Pixi 7.4.3 and 8.22.0 picture.js each ran four headless frames and matched updated stdout, including all five GL readback pixel checks. Original image.js matched its updated availability line. No T1 script, suite, pixel compare, benchmark or CI run. Logs/caller source in .logs/worker587; no process left running. Existing sprite-studio catch was already removed; the generic non-worker-engine guard in prelude remains valid.

Supported limits are documented in docs/guide/09-web-apis.md: local file/blob script URLs only; no nested workers, network worker scripts, importScripts, MessagePort or OffscreenCanvas transfer. No hardware, long churn or broad Web-platform conformance claim. Initial full build printed existing V8 SDK header warnings; both incremental builds were warning-free. Usage: n/a (tools/usage).

Proposed decisions: retain one existing worker thread/runtime/queue path, add owned source metadata rather than source tempfiles/registry; 256 messages/16 MiB per direction gives explicit backpressure and bounded queued copies without a new public setting.
Proposed tests: tests/run --tier t1 --only webenv_pixi (both pinned rendering/event paths, roughly seconds, modest single-window memory); long transfer/decode/terminate churn and worker scheduling on Pi/Mojave/OptiPlex at an owner-selected milestone (duration/memory to be bounded by that chosen workload). No later.md line needed beyond the explicitly deferred OffscreenCanvas/port transfer already in scope notes.

Final facade edge check: WHATWG message-port posting serializes/transfers before returning for a disconnected port (https://html.spec.whatwg.org/multipage/web-messaging.html#message-port-post-message-steps). Posting after terminate therefore still validates clone and detaches successful transfers before dropping the payload; exact regression passes. Worker-global messageerror/error handler properties forward manually dispatched events (error uses five arguments and true cancels); native uncaught worker errors retain the existing fatal parent-onerror path, without claiming worker-global interception. Exact web_worker re-run PASS after these JS-only edge changes.
<!-- SECTION:NOTES:END -->
