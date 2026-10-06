---
id: ZN-102
title: 'Plugin batch A: sqlite, wasm, process natives, ffi'
status: Backlog
assignee: []
created_date: '2026-10-06 22:55'
labels:
  - plugins
  - size-M
milestone: m-9
dependencies:
  - ZN-101
  - ZN-084
ordinal: 40440
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Vendor sqlite 3.53.4 and wasm3 under third_party/ (already vendored for the prototype in plugins/*/vendor: move, do not duplicate), ffi on libffi 3.8 instead of the hand-rolled call code with the same Spec. Decision D recorded: wasm3 now, WAMR as the upgrade path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 conformance sqlite.ts, wasm.ts, sys_process.ts, ffi.ts pass on macOS and in the Linux container
- [ ] #2 zinc:sqlite and WebAssembly resolve as std modules/globals (audit 02 RC23)
<!-- AC:END -->
