---
id: ZN-798
title: Fix five frontend defects a user program can hit
status: Backlog
assignee: []
created_date: '2026-10-24 23:55'
labels:
  - size-M
milestone: m-13
dependencies: []
ordinal: 5200
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
- [ ] #1 Map<K,V>.get of a missing key is undefined in a program that uses any (line 392 sample prints true1)
- [ ] #2 the camera.video `boolean | Interface` check in an async function compiles (no SIGSEGV in FnLower::writeVar)
- [ ] #3 `props.options.map((o, i) => <P .../>)` in a component passes the IR verifier
- [ ] #4 a local `let cur` no longer breaks narrowing of a module-level `cur` in other functions
- [ ] #5 an unannotated field initialised by a lambda call reports the errors of the lambda body
- [ ] #6 one regression test per defect in tests/t0
<!-- AC:END -->
