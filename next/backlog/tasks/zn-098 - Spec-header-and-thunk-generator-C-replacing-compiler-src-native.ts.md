---
id: ZN-098
title: 'Spec header and thunk generator (C++), replacing compiler/src/native.ts'
status: Backlog
assignee: []
created_date: '2026-10-06 22:54'
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
- [ ] #1 for all 22 specs the generated header is equivalent to the prototype generator's (golden comparison after normalising whitespace)
- [ ] #2 T0 test with the native-module example's sensor.host.cpp
<!-- AC:END -->
