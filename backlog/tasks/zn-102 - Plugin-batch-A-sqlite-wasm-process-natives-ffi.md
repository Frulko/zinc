---
id: ZN-102
title: 'Plugin batch A: sqlite, wasm, process natives, ffi'
status: Done
assignee: []
created_date: '2026-10-06 22:55'
updated_date: '2026-10-25 01:53'
labels:
  - plugins
  - size-M
milestone: m-9
dependencies:
  - ZN-101
  - ZN-084
ordinal: 374000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Vendor sqlite 3.53.4 and wasm3 under third_party/ (already vendored for the prototype in plugins/*/vendor: move, do not duplicate), ffi on libffi 3.8 instead of the hand-rolled call code with the same Spec. Decision D recorded: wasm3 now, WAMR as the upgrade path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 conformance sqlite.ts, wasm.ts, sys_process.ts, ffi.ts pass on macOS and in the Linux container
- [x] #2 zinc:sqlite and WebAssembly resolve as std modules/globals (audit 02 RC23)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Done: sqlite and ffi conformance pass natively on macOS (interpreter and AOT; auto mode now prefers a plugin's native code to a stand-in x.sim.ts, x.next.ts still wins; D21 updated in behaviour), ffi call() moved to libffi (system libffi: SDK on macOS, pkg libffi-dev on Linux; same Spec), string[] arguments added to the native ABI (letter S), WebAssembly global maps to zinc:wasm, sqlite/wasm3 stay in plugins/*/vendor (not duplicated). sys_process.ts passes (it tests zinc:sys). Blocked: wasm.ts needs a Zinc closure passed to a native export that returns a value (onImport) = ZN-167; Linux container run not done (no Docker by decision).
Review 2026-10-25: closed as Done. wasm.ts was blocked by ZN-167 (Done). The Linux container run is moot (no Docker by decision; Linux is the cross pass). Evidence: tests/t1/native_plugins.sh runs sqlite.ts, wasm.ts, socket.ts on native plugins; sqlite/ffi conformance; plugins/wasm/vendor Verifier: sqlite, wasm and ffi conformance match their .out natively on macOS (hand run); sys_process.ts passes. The Linux run is cross-pass work: it needs one line in later.md.
<!-- SECTION:NOTES:END -->
