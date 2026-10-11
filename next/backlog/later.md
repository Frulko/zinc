# Later: what is not a task yet

The backlog is frozen (AGENTS.md, "Keep the backlog shrinking and the sessions cheap", owner, 2026-10-11): an idea, an improvement, hardening, a measure
to take or a check on another target is one line here, not a task. `- ZN-n: what, and why it matters` (ZN-n is the task that found it).
The next backlog review turns lines into tasks or deletes them.

## Engine and tools

- ZN-569: a Worker in the web environment, and `createImageBitmap` with it; PixiJS `Assets.load` takes that path when both exist.
- ZN-569: images read and decoded off the frame in the host; a large image stalls the frame that loads it.
- ZN-565: one whole run of `tests/t1/webgl_conformance.sh` on a quiet machine; the last one timed out on one page under a load of 85 (695 of 787).
- ZN-373.04: a zinc:socket WebSocket client that calls ws.close() against `zinc debug --cdp` stays alive (a probe hit its 30 s timeout); the inspector quits explicitly, other clients would hang.
- ZN-373.05: Tracing against `zinc debug --cdp`: no frames there, the inspector's Performance view stays at "recording" for a debugger target.
- ZN-430: a .zapp's members are still unpacked once into the cache (its size again on disk); reading assets in place from the archive needs zinc:assets and the readers by path (video, sqlite, zinc:fs) on an archive source, the ZPK design of docs/reports/games/toolchain-assets-loading.md 6.1.
- ZN-155: `zinc ui` runs the prototype's Node tools (compiler/src/ui-tools.ts, ui-document.ts, ui-package.ts, about 400 lines); a C++ port would make it work in an installation without the checkout and Node.
- ZN-155: `p.then(x => promise)` does not flatten the promise it returns, so `fetch(u).then(r => r.text())` yields a Promise (async/await is right): the checker's __then helpers need a Promise-returning variant. The parity gate's most visible PARTIAL.
- ZN-155: console.log(-0) prints -0 (the prototype printed 0); an i64 near 2^53 rounds otherwise than the prototype; tests/conformance/scroll_physics.tsx prints nothing (its frozen output starts "dragged 150").
- ZN-155: default values in array patterns (`const [a = 1] = xs`) are still refused (object patterns take them).

## Demos

- ZN-649.14: a rule of a pinball table can listen to the plunger, so a skill shot needs no hidden sensor.

## Cross-platform pass

- ZN-576: tests/golden/webgl/antialias.js expects a multisampled canvas; on a GLES 2 context (Pi 3) antialias is reported false, so the golden needs a GLES 2 variant there.
- ZN-321: `zinc export --target linux --deb --key <seed>` then `zinc verify` on the .deb and on a changed copy (the .deb is signed by the export's artifact list; never run, a .deb needs the Linux cross build).
