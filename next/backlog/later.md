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

## Demos

- ZN-649.14: a rule of a pinball table can listen to the plunger, so a skill shot needs no hidden sensor.

## Cross-platform pass

- ZN-576: tests/golden/webgl/antialias.js expects a multisampled canvas; on a GLES 2 context (Pi 3) antialias is reported false, so the golden needs a GLES 2 variant there.
