---
id: ZN-1106
title: Widen optional numeric values without invalid box casts
status: Done
assignee: []
created_date: '2026-11-09 22:40'
updated_date: '2026-11-09 23:33'
labels:
  - ir
  - frontend
  - size-M
milestone: m-32
dependencies: []
ordinal: 1024
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while proving1102 optional collection-result chains. Original valid program function maybe(m:Map<string,string>|null):number|undefined{return m?.values().length;} fails interpreter IR verification with refcast Box<i32>→Box<f64> @main bb13. Root clean pre1102 binary SHA1d4b213a4d72e5693b03c4aaaaa7b5c6dd09ccad78886facfcc33edeb690e0f1 confirms baseline exit3. Repro .worktrees/1101/.logs/1102/optional-length-original.ts and optional-length-baseline.log. i32|undefined annotation is a separate valid exact-public-type test, not a fix for this accepted numeric-widening program; no application workaround. Inspect generic nullable numeric boxing/coercion and reuse established scalar conversion rules, not a values/length-specific special case or unsafe reinterpretation. Preserve D18 typed nullish representation, signedness/precision/profile constraints and ownership when reboxing. Fresh sole core worker work/1105 handles1105 and live neutral signals1107 first, then1106; previous1101 batch ended after four tasks. No sixth task was appended. Main runtime array/LVGL/Fenwick WIP stays untouched; prefer isolated frontend/IR fix. Short primary implementation research before task, then one target build/exact regression + unchanged original program, no suite/benchmark.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Nullable numeric coercions apply the existing allowed widening before or while boxing; optional i32 length can return number|undefined without an invalid Box<i32>→Box<f64> reference cast, preserving nullish representation and ordinary numeric rules
- [x] #2 Focused T0 covers absent/present and zero/negative/large integer values through returns, locals, parameters and generic/callback paths across interpreter/AOT/QuickJS, with meaningful IR/lifetime checks and invalid narrowing negatives
- [x] #3 The original optional Map length repro succeeds unchanged; collection_results and affected Code/UI consumers remain coherent, with docs/changelog/limits and proposed milestone checks recorded
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
- Baseline reproduced unchanged: `function maybe(m: Map<string,string> | null): number | undefined { return m?.values().length; }` failed IR verification because `coerce` fell through from `Box<i32>` to an unrelated `Box<f64>` reference cast. The original fixture is byte-identical to `.worktrees/1101/.logs/1102/optional-length-original.ts`; no return annotation or app workaround.
- The generic `FnLower::coerce` now splits absent/present boxed numeric values, keeps a null destination box for absence, and reuses existing box→scalar, scalar `Conv` and scalar→box operations for presence. Its join has the destination type. All 49 existing coercion caller sites were searched; optional access, returns, locals, globals, fields, generic/callback arguments and nullish CFG patterns keep one shared coercion path. No Map/length-specific handling, checker change, reference reinterpretation or new runtime API.
- Primary research: [C# nullable conversions](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/language-specification/conversions#1026-implicit-nullable-conversions) preserve absence and apply the ordinary underlying conversion to a present value; [Kotlin numbers](https://kotlinlang.org/docs/numbers.html#explicit-number-conversions) distinguishes numeric conversion from incompatible boxed references. Zinc keeps its own existing admission rules: `check.cpp` intentionally permits ordinary non-fixed machine numeric conversions (including truncation); this fix adds no narrowing policy. Meaningful rejection tests cover removing nullability, boolean→number, and fixed-point→integer in the ordinary floating profile. D18 typed null/undefined ABI, profile admission and the shared scalar conversion semantics remain unchanged.
- Own bounded `tools/build zinc` succeeds. No warnings in the changed `lower.cpp`; the fresh build emits 107 existing warnings outside the change (V8 headers, nanosvg, rg_etc1, agent/dev and asset code), recorded in `.logs/1106/build-resumed.log`; global warning-free build is not claimed. Engine SHA256 `be304b43aa965041ece9cf5c5f4c26df866830c921244989dcff769408c3837b`; lowering source `baaf2b4b428a83c5356fc83b6c8816eddd483651530c8fedf814475a208cfd08`.
- Final `tests/run --only nullable_numeric` passes: absent/present zero, negative/i32 maximum/u32 maximum/f32 values through returns, locals, parameters, generic arguments, callback returns and stored fields on interpreter/AOT/QuickJS; original optional Map caller succeeds unchanged on all three. Negative checks retain Z0103. Unoptimised reference-counted `@widen` IR asserts an absent/present split, `i32 getfield`, `f64 conv`, destination `new Box<f64>`, and no refcast. `mem --json --check-leaks` proves allocations=frees>0 and leaked=0. `zinc check` passes the positive fixture.
- Existing exact `collection_results` T0 passes with the new engine, including typed snapshot results and native/raw/package/script boundaries. Original React Data fixture also passes on all three new engines (typed editor commit/cancel/reentrant blur, PathBar same-event submission, state/ownership). Code's original full six model/engine proofs passed for the integrated 1105/1107 TS source; the coordinator will replay assembled Code after the final clean common engine rebuild. No Code control workaround or delayed UI event was added.

## Proposed tests

- Coordinator final clean common binary replay of the assembled original Code/Data gallery after C++ integration; a short run per model/engine, UI memory unmeasured.
- Owner-selected profile/device and broader conformance/ownership checks at a milestone. No suite, T1/T2/demo, benchmark, fuzz, pixel comparison or device run started; no owned process remains.

Usage: n/a (`tools/usage` provides no session usage in this worker).

Additional owner-machine proof 2026-11-10: unchanged tests/data/nullable_numeric/main.ts cross-built with clean integrated da7ca0360 for x86_64-linux, deployed to owned ~/zn/codex-1106-20261110-da7ca on OptiPlex Fedora45 via Tailscale, ZINC_HEADLESS=1 timeout15 run returns nullable numeric: pass, exit0. Binary SHA2567c6310a5f469884bef5d5572dd28cb11466d2508d585f3cfed408b4ac7e0ef3a. No remote process left. Desktop/GPU/native Linux compiler build not claimed. Tracked target provenance docs/reports/bench/kit-integration-2026-11-10.json.
<!-- SECTION:NOTES:END -->
