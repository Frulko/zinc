---
id: ZN-798
title: Fix five frontend defects a user program can hit
status: Done
assignee: []
created_date: '2026-10-24 23:55'
updated_date: '2026-11-09 04:14'
labels:
  - size-M
milestone: m-13
dependencies: []
ordinal: 9900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- zinc:camera: the compiler crashes (SIGSEGV in ir Lowering::FnLower::writeVar) on `const v = o.video; if (v === undefined || v === false) throw ...` where `video?: boolean | SomeInterface`, in an async function; without the local it is "internal error: instruction eq ... uses a missing value". lib/std/web.ts getUserMedia takes `video?: unknown` to avoid it. A user program can hit it.
- ZN-758: `Map<K,V>.get()` of a missing key returns null, not undefined, once a program uses `any` (`const m = new Map<string, boolean>(); function s(v: any): string { return '' + v; } console.log('' + (m.get('a') === undefined) + s(1));` prints `false1`); JS gives undefined; examples/music/src/ui.ts relies on `=== undefined`.
- ZN-757: IR verifier "const of a non-scalar type" (also "arrpush value type differs"): `props.options.map((o: string, i: number) => <P on={props.value === o} v={o} />)` inside a component; the relay inserts in a loop instead.
- compiler: a local `let cur` (a string) in one function breaks the narrowing of a module-level `let cur: Play | null` in other functions of the module (Z0107 "must be narrowed first"); examples/music/src/notify.ts renamed its local to `word`. Narrowing should key on the declaration, not the name.
- check: an unannotated field whose initializer calls a lambda (`static x = (() => { const s: string = 5; return 1 })()`) loses every error of the lambda's body: the field's type is inferred before the class exists with the diagnostics dropped, and `expr` then returns the cached call (check.cpp:621) instead of checking it again; static blocks are fixed (b0173526), the general case accepts wrong programs. Also UBSan reports in lower.cpp:1698 and tests/fuzz/fuzz_native.cpp:41 (fuzz logs of v0.4.3).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Map<K,V>.get of a missing key is undefined in a program that uses any (line 392 sample prints true1)
- [x] #2 the camera.video `boolean | Interface` check in an async function compiles (no SIGSEGV in FnLower::writeVar)
- [x] #3 `props.options.map((o, i) => <P .../>)` in a component passes the IR verifier
- [x] #4 a local `let cur` no longer breaks narrowing of a module-level `cur` in other functions
- [x] #5 an unannotated field initialised by a lambda call reports the errors of the lambda body
- [x] #6 one regression test per defect in tests/t0
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research (sonnet sub-agent, 2026-11-09): tsc keys narrowing on the resolved symbol, never the name (checkIdentifier -> getResolvedSymbol cached per node, getFlowTypeOfReference only narrows when isMatchingReference compares symbols); function bodies are checked once, deferred (checkNodeDeferred / checkDeferredNodes), and inference never caches a result whose diagnostics were dropped. Links: https://effectivetypescript.com/2024/03/24/flownodes/ ; https://source-hub.etos-pro.ru/microsoft/TypeScript/commit/ab686d83e991eecd922d6848709f5417f61f77c6 (per-file deferred nodes); tsz (Rust checker) bypasses its node cache where diagnostics must still run: https://docs.rs/crate/tsz-checker/0.1.9/source/src/expr.rs

Done (2026-11-09), reproduced first on develop b96feaa54:
- #1 Map.get with any: already fixed on develop (130773285, e9d6670c4, D224/D231 work); regression golden tests/golden/run/map_get_missing_any.ts.
- #3 props.options.map(<P/>) in a component: already passes the verifier on develop; T0 tests/t0/jsx_map_props.sh (interpreter and QuickJS). The relay's Choice is written back as a map (examples/notify-relay/main.tsx). zinc check of the relay first failed on src/relay.ts: a catch callback that only rethrows was typed as returning nothing (Promise<string | null>); fixed in callbackReturnsVoid (a body that cannot complete gives never).
- #2 boolean | Interface: the root was that a union of a primitive and another type had no IR type (Z0005), and writeVar crashed on the missing value. Such a union (Checker::dynBacked: two or more non-null members, one of them not an object, all convertible to Dyn) is now held as a Dyn: convertDyn wraps a member going in (__dynTo<T>) and a narrowed read or an `as` coming out (__dynFrom<T>), its null stays a null reference (the `unknown | undefined` convention: __dynTo of `unknown|undefined` going to an `unknown`, __dynOpt coming back), `===` goes through the Dyn helpers, the lowering maps the union to the Dyn class, and a syntactic union with a primitive keyword pulls in the Dyn prelude (needsJson). writeVar no longer reads the type of a missing value. lib/std/web.ts: MediaStreamConstraints is `video?: boolean | MediaTrackConstraints; audio?: boolean | MediaTrackAudioConstraints`. Golden tests/golden/run/union_primitive_object.ts.
- #4 narrowing: facts were keyed on symbols already; the name-keyed part was the TDZ prepass (fnMentions collected every identifier inside functions by name, so a local `let cur` made every read of the top-level `cur` from functions a __tdzChk call, which no test narrowed). fnMentions now resolves block scopes (params, let/const/function/class of enclosing blocks, hoisted var, for and catch bindings), and factsOf looks through __tdzChk so a function above the declaration narrows too. examples/music/src/notify.ts uses `cur` again. IR goldens closures and tuples lost needless TDZ flags (a parameter `k` and destructured `{ x, y }` shadowing top-level names). Golden tests/golden/run/narrow_global_shadowed.ts.
- #5 field lambda: the class-building pass infers the type from a copy of the initializer (cloneNode) when it holds a lambda, so the real check runs once with the class built and keeps its errors. tests/golden/checker/errors/field_lambda_init.ts, run golden tests/golden/run/field_lambda_init.ts. The UBSan lines (lower.cpp:1698, fuzz_native.cpp:41 of the v0.4.3 logs) were not reproduced here: no log at hand, line numbers moved; left for the fuzz milestone.

Ran: tests/run --only run, checker, ts_assignability, ir, jsx_map_props, microphone_sim: PASS. Every repro on the interpreter, --native and QuickJS (same output). zinc check examples/music, notify-relay, webcam, webrtc-call, hardware: ok; headless runs of examples/music (20 frames, shot looked at), notify-relay (3 frames) and tests/golden/host/webcam_draw.ts (output as tests/t1/webcam.sh expects).

Proposed tests: tests/t1/webcam.sh (getUserMedia with the typed constraints, ~10 s); tests/run --tier t0 (the goldens above, the IR goldens, ~2 min); tools/diff-matrix on tests/golden/run (the new goldens on the three engines, a few minutes).
<!-- SECTION:NOTES:END -->
