---
id: ZN-097
title: 'requireNative<Spec> intrinsic, ZBC natives section and CallNative'
status: Done
assignee: []
created_date: '2026-10-06 22:54'
updated_date: '2026-10-07 07:12'
labels:
  - abi
  - frontend
  - size-M
milestone: m-9
dependencies:
  - ZN-096
ordinal: 40390
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The frontend recognises requireNative<Spec>('Name'), validates the Spec's member types into signature strings, emits a `natives` section (names, signatures) and a CallNative opcode (ZBC version bump with the compat fixture), the verifier checks signature and index, the loader resolves against the registry and compares signatures. Diagnostics Z5010 (type not expressible) and Z5011 (module not linked) replace the run-time throw 'the native module X is not linked'; when a stand-in (x.next.ts / x.sim.ts) exists it is used and says so.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 fixtures: valid spec, bad type, unlinked module; the compat tests of docs/ir-format.md are updated (version 5, v4 refused as older)
- [x] #2 the AOT and the interpreter share the dispatch (T2 diff matrix includes a native-call program)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. requireNative<Spec>('Name') is lowered from the Spec interface of the file (src/frontend/modules.cpp lowerRequireNative): generated class + __native_<n> builtins -> IrOp::CallNative -> ZBC op CallNative and natives table (ZBC version 5, fib-v5.zbc, v4 refused as older). Loader (Machine::load) resolves against the registry and compares signatures; VM and AOT share nativeCall. Z5010 (type not expressible: today i32 u32 boolean f64 string u8[] i32[] f64[], callbacks/promises/resources wait for ZN-098) and Z5011 (module/export/signature not linked) replace the run-time throw; examples maps/explorer and svg-gallery move from RUNTIME to COMPILE. Fixture module 'Fixture' (C99) is registered in zinc and linked into AOT programs (option ZN_NATIVE_FIXTURE). Limits: a native error is an uncatchable trap; ZN_PENDING results unsupported; stand-in use is silent.
<!-- SECTION:NOTES:END -->
