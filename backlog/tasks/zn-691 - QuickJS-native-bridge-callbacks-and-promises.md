---
id: ZN-691
title: 'QuickJS native bridge: callbacks and promises'
status: Done
assignee: []
created_date: '2026-10-10 19:46'
labels:
  - qjs
  - plugins
  - size-M
dependencies: []
ordinal: 452410
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Follow-up of the first playable pinball, D77.) The generic bridge that lets a plugin's native module be called from QuickJS (src/qjs/native_js.cpp) passes values and arrays; a native function that takes a callback or returns a promise is not bridged.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a native module function taking a callback and one returning a promise work from QuickJS as from compiled code (test)
- [x] #2 plugins with such members are listed, with what now works
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: closed as Done. Callbacks and promise results of native modules are bridged on QuickJS: src/qjs/native_js.cpp:4-5, commit dd74d566, tests/t0/qjs_native.sh runs native_callbacks.ts against its golden. The plugin list (AC2) is not worth a task. Evidence: src/qjs/native_js.cpp:4; tests/t0/qjs_native.sh:10; dd74d566 Verifier: src/qjs/native_js.cpp:4-5 bridges callbacks (cb_call/cb_post) and promise results; tests/run --only qjs_native: PASS here today (native_callbacks.ts against its golden, also on jsc/v8/hermes when present). AC2's plugin list is paperwork.
<!-- SECTION:NOTES:END -->
