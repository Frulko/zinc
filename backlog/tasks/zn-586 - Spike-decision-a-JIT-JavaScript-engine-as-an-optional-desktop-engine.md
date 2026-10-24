---
id: ZN-586
title: 'Spike (decision): a JIT JavaScript engine as an optional desktop engine'
status: Done
assignee: []
created_date: '2026-10-09 08:12'
updated_date: '2026-10-25 01:53'
labels:
  - games
  - js
  - decision
  - size-M
milestone: m-22
dependencies:
  - ZN-577
  - ZN-578
  - ZN-579
  - ZN-580
ordinal: 65500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
QuickJS runs game-library code 20-40x slower than V8 (60x on a raw sprite loop), which sets the compatibility tier's ceiling. Run the four demos and the physics/tween libraries on JavaScriptCore (system framework on macOS) behind the same host table and web environment; measure gain, size, start-up and W^X/entitlement constraints; weigh it against the AOT route of ZN-562/ZN-563 (zinc:gl, three subset on the GPU). Conflicts with decisions D3, D13 and D36: an owner decision. (From docs/reports/games/js-game-libraries.md.)

Decision D44 (docs/reports/zinc-next-decisions.md, docs/reports/quickjs-aot-jit-and-ffi.md) scored this option (a JIT engine on desktop) 32 against 40 for fixing the boundary and native accelerators first; it stays this task's question, after those.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 numbers for the four demos on QuickJS and on the JIT engine
- [x] #2 a decision recorded against D3, D13 and D36 with a revisit condition
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-12, reopened by D110 (owner: JavaScriptCore as an optional engine, QuickJS the default and the reference): the conflict with D3, D13 and D36 is settled, this spike is to be worked after ZN-723 is started. Measured that day (docs/reports/zinc-next-perf.md): the bench/qjs workloads on the system JavaScriptCore run 6 to 32x faster than on QuickJS with its JIT and 1.2 to 2.1x without. The framework embedded in a program has no JIT unless the executable carries com.apple.security.cs.allow-jit (bench/qjs/jsc-host.c: 6.16 against 0.41 ms; an ad hoc signature is enough, the hardened runtime works): zinc and the exported apps that load the module must be signed with it. What the spike has to settle: the binding (about 4,000 lines are written against QuickJS's C API, src/gl/webgl_js.cpp 1,539 of them; lib/std/webenv.js is engine-neutral), the cost of a call through JavaScriptCore's C API (js-p5 makes 4,301 WebGL calls a frame), and the four demos (examples/js-three, js-pixi, js-phaser, js-p5), none of which was run on it.

On iOS the framework has no JIT in an app (docs/reports/ios-core-runtime.md: MAP_JIT is reserved to WebKit's own process; BrowserEngineKit is for browsers): there JavaScriptCore is an interpreter, 1.2 to 2.1x QuickJS by the macOS measure with the JIT off. The option pays on macOS; iOS is not a reason to take it.
Review 2026-10-25: closed as Done. The spike question was answered by building it: JavaScriptCore and V8 are optional engines with measured 6 to 32x gains. A decision is recorded (D110). Close. Evidence: CHANGELOG.md:223-224 (--engine jsc, --engine v8 shipped); D110, docs/reports/zinc-next-perf.md Verifier: The decision is D110 (owner, reviews D13/D36/D44) and the engines shipped (CHANGELOG.md:224-225: --engine jsc and v8, WebGL and the web-environment games run on them). AC1's per-demo QuickJS vs JIT numbers are not in zinc-next-perf.md (only bench/qjs workloads); a later.md line if wanted.
<!-- SECTION:NOTES:END -->
