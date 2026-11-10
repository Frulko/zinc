---
id: ZN-1113
title: Support ReturnType for inferred application model types
status: Done
assignee: []
created_date: '2026-11-10 02:29'
updated_date: '2026-11-10 02:42'
labels:
  - compiler
  - ui
  - size-S
milestone: m-32
dependencies: []
ordinal: 1240.1
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Natural Mail model exports type Mailbox = ReturnType<typeof createMailbox>; zinc check rejects ReturnType with Z0101 while TypeScript utility return type is the ordinary way to share inferred model shape with component props. Four-line minimal .logs/blockers/return-type/return-type.ts expects42, current check failure in return-type.log. Keep original Mail code. Add the compiler utility using existing callable type machinery; inspect overload/generic/constraints and existing Partial/Required/Readonly/Pick/Omit handling. Primary short lookup https://www.typescriptlang.org/docs/handbook/utility-types.html#returntypetype; documented final overload behavior and generic return semantics. Do not invent a second conditional-type framework if existing types suffice. Protected runtime/HAL/ui.ts WIP remains untouched.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ReturnType resolves callable return types with appropriate constraints/diagnostics and preserves ordinary function model shape; small exact T0 covers named/typeof, generics and overload behavior as applicable to Zinc supported syntax
- [x] #2 Original Mail state and component prop types check and its short feature runs pass on interpreter, AOT and QuickJS without caller rewrite
<!-- AC:END -->

## Implementation Notes

- Research: TypeScript's primary utility reference https://www.typescriptlang.org/docs/handbook/utility-types.html#returntypetype specifies extraction of the callable result, final overload signature and generic constraint/unknown inference. Coordinator supplied the primary lookup (Sonnet unavailable); worker read it directly. No dependency, conditional-type framework or overload infrastructure added.
- Existing type-query annotations only recognized variables/parameters and could not expose a declared function's signature. They now resolve a function's pending return inference with the same recursive-inference guard used for expression references, then expose its existing Func type. ReturnType uses the existing utility dispatch and Func.elem; constraints and arity have ordinary diagnostics. Generic aliases work through existing instantiation, and direct typeof generic functions instantiate at constraints/unknown so inferred nested record results keep their exact shape. Dyn prelude detection includes ReturnType for the implicit unknown generic result. lib/zinc.d.ts exposes the standard utility to editors/oracle.
- Exact T0 return_type PASS all3: named callable type, typeof inferred model including a typed callback, generic callable alias, any, generic identity returning unknown, constrained numeric-array and inferred generic-record returns, and void. Negatives: non-callable string/unknown and wrong field type Z0103, missing model/unknown fields Z0106, wrong arity and recursive return inference Z0109. Existing overload declarations without bodies remain explicitly rejected by Z0005 (asserted); unsupported generic function type literal syntax and general conditional types are unchanged. `zinc check tests/data/return_type/main.ts` PASS. Mappings/changelog included.
- Original Mail state and component sources copied unchanged and hashes verified against .logs/mail1078.25-20261110/provenance.json; state.ts SHA256 f75f35d5f221ab5b24eefeab2575fe6c6b1f9e960aa419bd171c98852e78bd5e, main.tsx199669e69d3d012650ad4cacfc64f83bb6d96d68cea85acb6d793b6d4f4ff0f1. Mail worker checked all8 files with final candidate, ran the actual entry in interp/AOT for240frames and the same scripted actions:54 rendered-text assertions pass across QJS/interp/native (search, read/unread, star/unstar, archive/restore, local compose validation/copy to Sent, clear, theme). Light/dark native+interp captures inspected by Mail worker. No model/prop/provider workaround, no external sending.
- Final candidate .worktrees/1111/build/zinc SHA2565ec63ede27ea650917f80d20763d521763582eb89a107b34cea5821fec55e6f7, adjacent AOT archives intact. Warm build succeeds warning-free in changed sources. Durable .logs/blockers/return-type/{build-1113,t0-1113,candidate-check,candidate-main-interp}.log, candidate-1113-provenance.json and candidate-original-mail/ archive; full original-Mail logs/captures/source hashes in .logs/mail1078.25-20261110/{check-candidate,actions-interp,actions-native,assert-actions}.log and provenance.json. Earlier QJS actual actions used common397865; final candidate QuickJS original entry4frames PASS exit0, .logs/mail1078.25-20261110/candidate-quickjs.log and candidate-quickjs.png; all3 candidate proof complete.
- Batch usage: usage: n/a. No new decision/later line; no owned process left, no common binary replaced, no push. Suites, cross-platform runs, conformance/fuzz and performance measurements skipped under the owner rule.

## Proposed tests

- `ZINC_ROOT=$PWD ZINC=$PWD/build/zinc tests/run --only return_type`: exact callable extraction/shape/constraints/recursion regression all3, about2–5seconds warm / under100MB.
- Bounded original Mail all3 actions at240frames with .logs/mail1078.25-20261110/actions.input: visible search/read/star/archive/compose behavior with preserved inferred prop types, about4seconds runtime perengine plus AOT compilation / under200MB; longer navigation/VoiceOver/device checks remain in ZN-1078.25.
