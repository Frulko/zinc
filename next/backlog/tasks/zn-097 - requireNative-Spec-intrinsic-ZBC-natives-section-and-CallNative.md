---
id: ZN-097
title: 'requireNative<Spec> intrinsic, ZBC natives section and CallNative'
status: Backlog
assignee: []
created_date: '2026-10-06 22:54'
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
- [ ] #1 fixtures: valid spec, bad type, unlinked module; the compat tests of docs/ir-format.md are updated (version 5, v4 refused as older)
- [ ] #2 the AOT and the interpreter share the dispatch (T2 diff matrix includes a native-call program)
<!-- AC:END -->
