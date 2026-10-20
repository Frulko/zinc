---
id: ZN-637
title: 'Prototype: build plugins/devtools with the new Spec member net'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 14:28'
updated_date: '2026-10-10 16:57'
labels:
  - devtools
  - size-S
milestone: m-20
dependencies: []
ordinal: 50240
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ZN-370 added `net` to the devtools native Spec with a one-line stub in cdp.host.cpp; the prototype build of the plugin was not compiled. (Follow-up of ZN-370, D60.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the prototype builds and runs an app with zinc:devtools on macOS
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-10 in a parallel worktree. Usage: n/a (tools/usage).

Finding: the member `net` broke nothing (cdp.spec.ts, cdp.sim.ts and cdp.host.cpp agree; no hunk in plugins/devtools). What stopped the prototype is older: since 2026-10-08 it compiled no zinc:ui program, so no program with zinc:devtools (its index.ts imports zinc:ui):
- lib/std/ui.ts imports commandCount and commandsFree (5e601b6c: in runtime/gfx.cpp, not in lib/gfx.d.ts nor sim/gfx.mjs), UI_LAYOUT and UI_PRESET of zinc:platform and the module zinc:__layout (3d6b5460, 2c25d08f: Zinc Next only), onResize (8c7a8d61: in lib/gfx.d.ts, not in the prototype's runtime nor the sim);
- propId compared the number of a Map.get() with undefined (46a66229): Z1013 in the prototype;
- inspect() used a closure that calls itself (8ffe3d35): the prototype's Sema accepts it and its C++ backend emits `auto walk = [=]... walk(...)`, which does not compile.

Fix (one commit with the test):
- compiler/src/capabilities.ts: zinc:platform has UI_LAYOUT 'classic' and UI_PRESET ''.
- compiler/src/frontend.ts and lib/compat/proto-layout.ts (new): zinc:__layout as a module of empty functions with the signatures of Zinc Next's (never called in the classic layout).
- lib/gfx.d.ts: commandCount and commandsFree declared. sim/gfx.mjs: commandCount, commandsFree, onResize.
- runtime/zrt.h and runtime/gfx.cpp: zrt::gfx::onResize, accepted and never called (the prototype keeps the surface zinc.json chose; marked `ponytail:`).
- lib/std/ui.ts, 2 hunks, same behaviour: propId returns `PROP.get(key) ?? 0` (the idiom already used for COLORS, still one lookup in Zinc Next); inspect() walks with a module function inspectFrom instead of the closure. Same text: the old and the new inspect() compared on the sim, and the sim compared with the macOS build, on a tree with roles, labels, a plain box and an aria-hidden subtree.
- scripts/cdp-check.mjs: also asks Network.enable and Network.getResponseBody.
- Test: tests/t1/proto_devtools.sh with tests/golden/proto-devtools/main.tsx ($ZINC is not used; skips off macOS and without node, cmake or the root node_modules).

Evidence (Intel Mac, 2026-10-10):
- `tests/run --tier t1 --only proto_devtools`: PASS. The app runs in the sim (`devtools app up`), is built for macos with the headless HAL, and scripts/cdp-check.mjs prints 12 ok lines and no FAIL, among them `ok   Network.getResponseBody: {}` (the member `net` through index.ts and cdp.host.cpp) and `ok   Page.captureScreenshot: 230723 bytes (320x240)`.
- The test can fail on the member: with the `net` line removed from cdp.host.cpp it stops at `error: variable type 'HostCdp' is an abstract class` / `unimplemented pure virtual method 'net' in 'HostCdp'`.
- Window build (SDL HAL): `ZINC_DEVTOOLS_PORT=19637 ZINC_FRAMES=30 node compiler/bin/zinc.mjs run tests/golden/proto-devtools/main.tsx --target macos` prints `zinc: built macos: zinc 3457 ms, C++ 11979 ms, 2449.2 KiB`, `zinc devtools: chrome://inspect (Discover network targets: localhost:19637) or ws://127.0.0.1:19637/zinc`, `devtools app up`; exit 0.
- The prototype's own harness of the transport: `bash scripts/fuzz.sh --replay cdp` prints `cdp 4 - ok` (ASan and UBSan; tests/fuzz/natives.ts imports zinc:devtools, three, zinc:svg, zinc:lottie, zinc:map, zinc:remote, zinc:mapping).
- `node compiler/bin/zinc.mjs test --target sim`: 62 programs, 3 failures; the 20 .tsx UI programs print their goldens. tests/conformance/kit_solid.tsx as a macOS headless build prints its golden too.
- `tsc -p compiler --noEmit`: no error.

Not verified here (this worktree builds no Zinc Next): the Zinc Next tests that cover lib/std/ui.ts and runtime/gfx.cpp. After integration: ui_a11y (inspect), jsx_style and the ui tests (propId), perf_hud and scale_push (runtime/gfx.cpp).

Decisions for the coordinator to record:
- lib/std/ui.ts stays inside what the prototype compiles, and proto_devtools guards it (about 40 s: one sim build, one macOS build). Why: tools/proto-capture capture and tools/example-output run the prototype on the demos, so with ui.ts outside its subset no new prototype golden can be made. The cost over the 60 commits to ui.ts since 2026-10-08 was 2 constructs and 6 host names. Rejected: a frozen copy of lib/std for the prototype (two libraries to keep), recursive closures in the prototype's emitter (more risk than one function in ui.ts).
- onResize in the prototype is accepted and ignored: a port of ZN-608 would change the prototype's windows, and the callback would need a teardown on hot reload.
- Row for tests/affected.json: {"paths": ["../plugins/devtools/", "../compiler/", "../sim/", "../lib/std/ui.ts", "../lib/gfx.d.ts", "../lib/compat/proto-layout.ts", "../scripts/cdp-check.mjs", "tests/golden/proto-devtools/"], "tests": ["proto_devtools"]}.

Follow-ups to file:
1. "Prototype: zinc:net programs compile again" (size-S). lib/modules.d.ts:142 declares the anonymous object type `{ cert: string; key: string; }` (c4548c6a, TLS): Z9004 in tests/conformance/fetch.ts and modules.ts; tests/conformance/fetch_web.ts:4 gives Z9033 ('e' is declared twice with different types in one async function). AC: `node compiler/bin/zinc.mjs test --target sim` prints 62 programs and no failure.
2. "Prototype: a closure that calls itself is refused or compiled" (size-S, low). `const walk = (h: i32): void => { walk(h); }` passes Sema and emits C++ that does not compile. AC: a Z diagnostic at the closure, or a conformance program with such a closure that prints the same in the sim and as a native build.
3. Only if the prototype should follow ZN-608: "Prototype: zinc:gfx onResize calls back and follows the window" (size-S). AC: the callback runs from sync_surface when the surface changes size, hal_set_resize(1) is asked, and a hot reload clears it.
<!-- SECTION:NOTES:END -->
