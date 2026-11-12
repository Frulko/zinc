---
id: ZN-1123
title: Preserve exact Dyn types in generated callback converters
status: Done
assignee: []
created_date: '2026-11-12 04:44'
updated_date: '2026-11-12 04:53'
labels:
  - language
  - frontend
  - size-S
milestone: m-7
dependencies: []
ordinal: 50001
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks unchanged rn-showcase native compilation, discovered by ZN-863.03. lib/std/fetch.ts Request.clone boxes self into unknown and the generated from-Dyn callback loses a concrete Dyn parameter as any. A four-line class-to-unknown reproduction fails Z0103 on clean develop engine b63c8367a. Fix the frontend generator once; no application/library annotation workaround, assignability relaxation or runtime change. Read .logs/research-request-check-g/report.md and retained failing fixtures/logs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Generated callback converters retain exact unknown/Dyn, actual any and Dyn-subclass parameter/result identities; a focused regression typechecks and runs on interpreter, AOT and QuickJS without weakening invalid-call rejection.
- [x] #2 The original unchanged Request clone/fetch source and examples/rn-showcase typecheck successfully; source hashes demonstrate no caller workaround.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Preserved exact generated callback signatures through existing `__T<id>` aliases. The generator now reports alias-only dependencies separately from converter dependencies, so TK::Any, the actual Dyn class (`unknown`) and concrete Dyn subclasses retain their distinct TypeIds without producing unnecessary converters. Subclass expressions use their exact type assertion when an internal Dyn call returns the base class. No assignability/thunkability, IR, runtime, standard library or demo source changed.

Scope read: sole dynConverter caller dynSym, alias registration/addAliases, convertDyn callers and the standalone function/object-method adapters. Existing generator context and lifecycle behavior are unchanged; no new lifecycle or dependency was introduced. Delegated primary research retained under `.logs/research-request-check-g/`; TypeScript unknown and compatibility references: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-0.html and https://www.typescriptlang.org/docs/handbook/type-compatibility .

Proof: clean own-tree `tools/build zinc` and incremental rebuild through the shared work-run queue; `.logs/build.log` and `build-2.log`. Changed frontend compilation emits no warnings; the full build retains existing external V8 SDK unused-parameter and duplicate-library linker warnings. `.logs/final-proof-2.log` records PASS: old common binary rejects the four-line reproduction with Z0103, fixed binary accepts it; exact T0 dyn_callback passes (real TK::Any/Dyn/DynNum source-generator assertions, unknown/any/subclass callback fixtures on interpreter/AOT/QuickJS, invalid argument/result/subclass rejection); original Request.clone plus local data: fetch runs identically on all three engines; unchanged rn-showcase checks 32 source files. Final T0 log `.logs/t0-final.log`; diagnostics and whole earlier failures retained. No suite or benchmark.

Caller integrity: `.logs/callers-unchanged.json` verifies all 56 tracked fetch/rn-showcase files byte-for-byte against base 722836789, with blob ids and SHA256. Binary/module provenance is `.logs/binary-provenance.json`. Actual any means internal TK::Any in the C++ generator check; source-level any is the separate dynamic type, covered by the three-engine fixture.

Earlier experimental checks are explicitly retained: directly constructing internal DynNum works on native engines but is absent from QuickJS, and calling toString through its dynamic primitive representation has differing semantics; neither is a public cross-engine API. The committed subclass fixture instead checks callback value identity with equality, while the C++ check asserts exact subtype signatures/aliases. An attempted wrong runtime return annotation is checked on native engines but erased by QuickJS, so invalid calls/results are proven by checker diagnostics rather than claiming erased annotations enforce runtime checks. One overly broad test assertion expected a subclass return cast even for void/other return types; corrected to assert it for the actual subtype return and for to-Dyn argument adapters. All failed logs and reconstructed source snapshots are retained.

Proposed decision (no D number): preserve exact alias identity rather than spelling every Dyn-family type any/unknown or loosening compatibility. This is the smallest frontend-only change and retains existing rejection rules. No later.md line required.

Usage: n/a (tools/usage).

Proposed tests: owner-selected existing `dyn_function` and `open_record_methods` regressions, seconds to ~30s each, memory unmeasured, for adjacent adapters; no suite selected. Cross-platform compiler/package checks at the owner's milestone remain unrun. No performance claim.
<!-- SECTION:NOTES:END -->
