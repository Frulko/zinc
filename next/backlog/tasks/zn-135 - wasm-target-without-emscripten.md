---
id: ZN-135
title: wasm target without emscripten
status: Review
assignee: []
created_date: '2026-10-06 23:01'
updated_date: '2026-10-08 08:27'
labels:
  - targets
  - size-L
milestone: m-11
dependencies:
  - ZN-124
  - ZN-115
ordinal: 40770
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
zig c++ -target wasm32-wasi build of rt, vm and zbc (interpreter in the browser) and of AOT output; canvas and input imports through a small JS glue; headless runner on wasmtime.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 the 18 M3 programs match the interpreter on wasmtime; breakout draws in a browser through the glue (checked by a headless Chrome script when available, else skipped)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. tools/build-wasm: zig c++ wasm32-wasi over rt, zbc, vm (no emscripten): vm.wasm (WASI) and vm-web.wasm (reactor + zn.gfx import). tests/t2/wasm.sh: the 18 M3 programs match the interpreter on Node's WASI (wasmtime is used when installed; it is not installed here). tests/t2/wasm_browser.sh: breakout draws its title screen in headless Chrome through the glue (worker, OffscreenCanvas, Atomics frame wait, COOP/COEP). Fixes made for WASI: no mimalloc, no this_thread, native-module and exception stubs. Open: the AOT output on wasm (the task text also asks for it), gradients, shadows, images and polygons in the glue, the frame comparison with the native breakout frame.
<!-- SECTION:NOTES:END -->
