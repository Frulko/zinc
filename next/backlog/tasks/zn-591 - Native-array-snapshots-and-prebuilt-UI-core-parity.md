---
id: ZN-591
title: 'Native array snapshots and prebuilt UI core parity'
status: Backlog
assignee: []
created_date: '2026-10-09 12:00'
labels:
  - parity
  - native-abi
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The prototype draft in `compiler/src/abi.ts` and `runtime/include/zinc_abi.h` introduces ABI v4 ARRAY return snapshots: scalar elements or named records with scalar fields. It generates element metadata and retained native storage, but `runtime/vm/abi.h` and the QuickJS adapter do not consume ARRAY results yet. The declared element/byte limits are a proposed contract, not enforced support. Do not treat the draft as a completed feature.

Carry the supported contract into Zinc Next through its existing generic host ABI, without adding plugin or demo cases to the engine. Keep the prototype files as the reference; finish the adapter behavior in a separate implementation task if prototype compatibility is required.

`node tests/engines/prebuilt-core.mjs` currently fails while compiling forms: missing `zinc:gfx` commandCount/commandsFree, platform UI_LAYOUT/UI_PRESET and `zinc:__layout`. After those inputs are resolved, ARRAY support and script/core compatibility still need validation. The test checks unchanged core hashes/mtimes, changed capture pixels and rejection of missing exports.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria

<!-- AC:BEGIN -->
- [ ] #1 Scalar and scalar-field record arrays cross the existing host ABI on the Zinc Next interpreter, AOT and QuickJS paths, with identical observable values.
- [ ] #2 Validate element tags, record shapes, null elements, lengths and the proposed 1,048,576-element / 64 MiB limits before guest allocation; cover rejection cases with focused tests.
- [ ] #3 Copy borrowed strings and records before the next native call; guest mutations cannot modify native snapshots. Reject unsupported array arguments explicitly.
- [ ] #4 A focused prebuilt UI core check proves script-only recompilation changes rendered pixels without rebuilding the core, and rejects incompatible exports before execution.
- [ ] #5 Document supported ABI versions, core cache invalidation and remaining prototype limitations; pass the relevant tests and `next/tests/run --changed`.
<!-- AC:END -->
