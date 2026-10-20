---
id: ZN-098
title: 'Spec header and thunk generator (C++), replacing compiler/src/native.ts'
status: Done
assignee: []
created_date: '2026-10-06 22:54'
updated_date: '2026-10-07 07:27'
labels:
  - abi
  - tools
  - size-M
milestone: m-9
dependencies:
  - ZN-097
ordinal: 40400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`zinc native-gen <spec.ts>` writes zinc_native_<x>.h (abstract NativeX class with zrt types and zinc_create_X) plus the thunk and registration from the Spec, exactly what compiler/src/native.ts generated, so the 22 existing plugin .host.cpp files compile unchanged; a C header variant for new code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 for all 22 specs the generated header is equivalent to the prototype generator's (golden comparison after normalising whitespace)
- [x] #2 T0 test with the native-module example's sensor.host.cpp
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. zinc native-gen [--c] <x.spec.ts> [outdir] (src/frontend/native_gen.cpp): zrt-typed abstract NativeX + zinc_create_X header, equal (whitespace-normalised) to the prototype generator's for all 23 specs (goldens in tests/golden/native_gen, produced by running the prototype); sensor.host.cpp compiles unchanged; --c writes the ZnExport table for native.h (scalars, strings, u8/i32/f64 arrays only). Not done: record-typed members (no spec uses one; the prototype's namespaces are path-derived) give an error; the thunk/registration that binds a loaded host.cpp to the registry belongs to ZN-099/101.
<!-- SECTION:NOTES:END -->
