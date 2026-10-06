---
id: ZN-135
title: wasm target without emscripten
status: Backlog
assignee: []
created_date: '2026-10-06 23:01'
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
- [ ] #1 the 18 M3 programs match the interpreter on wasmtime; breakout draws in a browser through the glue (checked by a headless Chrome script when available, else skipped)
<!-- AC:END -->
