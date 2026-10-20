---
id: ZN-103
title: 'zinc:script on the engine''s own QuickJS-ng'
status: Done
assignee: []
created_date: '2026-10-06 22:55'
updated_date: '2026-10-07 09:39'
labels:
  - plugins
  - size-M
milestone: m-9
dependencies:
  - ZN-101
  - ZN-061
ordinal: 40450
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rebase the script plugin on next/src/qjs (one vendored QuickJS, decision D10): eval, call, function handles, Dyn crossing as a snapshot, memory/time limits and the interrupt handler through QuickJS hooks, module loading, promises pumped per entry as the prototype's quickjs.host.cpp does; plugins/script/vendor/quickjs is no longer used by next.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 tests/conformance script_basic.ts, script_async.ts pass; time and memory limit tests
- [x] #2 examples/scripting/{bench,breakout-mods,playground} run headless
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Built-in native module QuickJS (src/qjs/script_native.cpp, C ABI, registered by zinc, linked into AOT programs via libzn_script) implements the unchanged plugins/script spec on next's QuickJS-ng: entries with time/memory/stack limits and interrupt, promise pumping, module loading, function handles ({__zn_fn:n}), host functions (sync and async) as callbacks, errors with kind/type/line/file. unknown crosses as JSON through generated wrappers (nativeLetter dyn mode, __nativeJson/__nativeValue/__nativeArgs), ZnHostApi.cb_error carries a Zinc throw into the script as an Error. script_basic.ts and script_async.ts pass interpreted and AOT (tests/t1/script.sh); scripting/{bench,breakout-mods,playground} run headless (examples.lst OK). Fixed on the way: AOT functions that only call natives were treated as leaves (registers as C++ locals) and their callbacks smashed the stack. D22 recorded.
<!-- SECTION:NOTES:END -->
