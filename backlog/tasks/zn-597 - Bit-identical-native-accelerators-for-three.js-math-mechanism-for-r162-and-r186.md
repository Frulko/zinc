---
id: ZN-597
title: >-
  Bit-identical native accelerators for three.js math (mechanism for r162 and
  r186)
status: In Progress
assignee:
  - '@parallel'
created_date: '2026-10-09 09:28'
updated_date: '2026-11-10 21:40'
labels:
  - perf
  - quickjs
  - 3d
  - size-M
milestone: m-21
dependencies:
  - ZN-596
priority: high
ordinal: 16900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Measured: replacing Matrix4.prototype.multiplyMatrices of three r186 by a native function that reads the plain-Array `elements` in place gives 1.61 -> 0.084 us per call and the three.js CPU frame of 500 meshes 7.9 -> 6.0 ms (-24%), results bit-identical when compiled with -ffp-contract=off and the same operation order. Build the mechanism: an accelerator table installed on library prototypes by the web environment (opt-out flag), each native method guarded (fast array of 16 numbers, plain data property) with the original JS method as fallback; then the hot set: Matrix4.multiplyMatrices/compose/invert, Matrix3.getNormalMatrix, Vector3/Vector4.applyMatrix4, Sphere.applyMatrix4, Frustum.intersectsSphere/intersectsObject, Quaternion.setFromEuler, Object3D.updateMatrix. ZN-543 then builds the Pi-specific batch operations (subtree world matrices, culling lists, skinning) on this mechanism. (From docs/reports/quickjs-aot-jit-and-ffi.md.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a host test compares every accelerated method with three's JS on 10^5 random inputs: bit-identical outputs (===), including -0 and NaN cases
- [ ] #2 the report's w_three workload (500 meshes) <= 4.5 ms per frame on the M1 Pro (today 7.9 ms)
- [ ] #3 accelerators can be disabled (ZINC_JS_ACCEL=0) and the three.js demo frames are identical either way
- [ ] #4 works for vendored three r186 and r162
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-10 worker, arithmetic phase (shared QuickJS core still reserved by Intl):
- Read ZN-596 / D257 and `quickjs-aot-jit-and-ffi.md` §5.5. The historical 1.61→0.084 μs multiply and 7.9→6.0 ms frame numbers are prototype results, not this implementation. The ≤4.5 ms gate remains unproven.
- Delegated research supplied by the coordinator (`.logs/research-597.txt` in the main tree): QuickJS nonthrowing borrowed access requires all guards before mutation; original fallback is retained per context with `JS_NewCFunctionData`. Sources: https://raw.githubusercontent.com/quickjs-ng/quickjs/v0.17.0/quickjs.c and https://github.com/mrdoob/three.js/blob/r186/src/math/Matrix4.js (r162 counterpart too). Only prototype arithmetic was reused; no raw-private-property or global fallback integration was copied.
- Pure kernels retain each upstream version's expression order (notably separate r162/r186 Matrix4 inversion) and use `-ffp-contract=off`. Quaternion trigonometry uses Zinc's existing deterministic `zn_js_cos/sin`.
- Standalone proof against unmodified r186 core and the existing checksum-pinned external r162 test input passes 100000 deterministic inputs per arithmetic shape/version plus 112 edge cases/version, including signed zero, NaN, infinities and singular matrices. `Object.is` checks signed zero/NaN correctly; finite numeric equality implies the same binary64 bits. This proves arithmetic only, not production installation/guards or AC1 yet. Provenance and exact source/archive hashes: `.logs/kernels-provenance.json`; output `.logs/kernels-r186.log`, `.logs/kernels-r162.log`. The common archives were read-only.
- Planned integration: extension-owned source signatures and native table, existing QuickJS context hook extended with optional generic source transform before source-cache fingerprint. Append registration after the pinned library declarations; unknown/modified sources stay unchanged. Native installation also honors `ZINC_JS_ACCEL=0`, including previously built bundles. Portable WebGL and other JS engines carry no QuickJS binding.
- Preserve nested method overrides and scratch-sphere behavior. `Frustum.intersectsObject` must retain/update its actual upstream lexical scratch sphere; an escaped scratch center aliased to a frustum plane normal must fall back to preserve update-before-plane-read order. Use public descriptor/class guards and setters initially; add no private writable accessor without evidence.

Proposed tests: quiet report workload `w_three` (500 meshes, ≤4.5 ms CPU frame), owner milestone only; standalone numerical proof is not a timing claim. Production exact T0, opt-out and short actual demo hash proof follow after the shared-core handoff. Vendored r162 production selection remains the separate ZN-540 boundary, not silently satisfied by duplicating the test fixture.

2026-11-10 worker, standalone production binding phase:
- Added the complete eleven-method table under `plugins/three/native/`, with exact r186-core/r162-module source hashes, per-context `JS_NewCFunctionData` retention, canonical class/prototype and own data/writable descriptor guards, dense numeric arrays, scalar snapshots and public setters. No QuickJS patch, opcode or wire change. Existing JS engines and the ordinary typed Three plugin remain untouched.
- Full original-JS versus installed-native host proof passes 100000 deterministic inputs per actual method for both versions, plus 112 edge cases/version and 43 adversarial scenarios. Separate original/accelerated module prototypes and function identities are asserted. `ZN_THREE_MATH_TEST` counters compile out of production and prove every native kernel was reached and every designated adverse scenario used the retained-original fallback. `.logs/extension-provenance.json` records source/archive hashes.
- Both versions additionally pass disabled source/context and absent-installer execution of an already-transformed bundle, unknown and same-length modified-source rejection. `.logs/disable-r186.log`, `.logs/disable-r162.log`. The one retained T0 is `qjs_three_math`; the initial standalone arithmetic-only harness was moved to `.logs/arithmetic-phase` to avoid duplicate committed tests.
- A private harness teardown crash was an embedding error: shared libregexp needs `zn_lre_delegate` set to QuickJS's callbacks, as real Zinc startup already does. The actual frozen CLI passed the pure-JS fixture; corrected standalone harnesses now match its allocator initialization. No engine defect or third-party patch was introduced for this.
- Isolated production-build QuickJS accounted heap (not RSS): bare context 86430 B, unused binding 89929 B (+3499 B); r186 plain library 3452782 B versus native 3456676 B (+3894 B); r162 4135373 B versus 4139163 B (+3790 B). Private host `.logs/math-cost.cpp` and `cost-r186.json`/`cost-r162.json`. No startup, frame time, native binary, physical memory or zero-unused-cost claim.
- Generic core hook/startup/cache wiring and actual frame proof still await the coordinator's shared-core handoff from Intl. All AC remain unticked until the complete integrated boundary is proven. Final exact source hashes and both latest 100000-case runs (including all 43 adverse cases and opt-out/absent binding checks) are in `.logs/extension-provenance.json`; exact T0 output is `.logs/t0-qjs-three-math.log`.

Proposed decision for the coordinator: retain public QuickJS guards/setters and the existing static QuickJS extension archive. RULES-order engineering scores (not measured speed): static/public 5/3/4/5/5/5/5=62; optional DSO/new API table 5/3/5/3/5/4/2=56; additional raw-private accessor 5/4/4/2/4/3/2=52. Revisit raw writable access only after an owner-selected measurement identifies setter/descriptor overhead as material. Generic source hook wiring must preserve the existing one-argument `addContextHook(ContextHook)` ABI symbol; add an overload, not only a default parameter.

<!-- SECTION:NOTES:END -->
