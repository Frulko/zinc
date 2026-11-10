---
id: ZN-1116
title: Lower captured recursive local functions without invalid IR
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-10 03:18'
updated_date: '2026-11-10 03:23'
labels:
  - compiler
  - ui
  - size-M
milestone: m-32
dependencies: []
ordinal: 1249
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Original Music library state checks but interpreter/AOT fail IR verification after reference counting with const of a non-scalar type in local poll closure. Minimal10lines .logs/blockers/recursive-local-function/recursive-small.ts: make() captures generation in nested function poll, nested setTimeout arrow reads token/generation and references poll recursively; merely constructing returned {poll} fails, never invoking it. QuickJS original Music runs. Root Music worker also has larger signal/forward-local-function reproduction and original examples/ui/music/src/state.ts. Preserve natural code, fix shared frontend/IR capture lowering/RC once across engines. Test captured recursive local function construction and one bounded callback/restart/disposal where relevant, scalar closure controls/forward mutual callable only as implicated. No caller rewrite/top-level extraction. Protected src/rt/runtime/HAL/lib/std/ui.ts external WIP untouched. Primary lookup ECMAScript function declarations/captured lexical environment https://tc39.es/ecma262/multipage/ecmascript-language-functions-and-classes.html#sec-functiondeclarations; Sonnet unavailable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Natural captured recursive local declarations and nested callbacks lower valid IR and run with correct capture semantics/evaluation across interpreter AOT and QuickJS; small exact T0 regression
- [x] #2 Original unchanged Music state and short muted playback/UI proof pass on all three engines without app rewrite
<!-- AC:END -->

## Implementation Notes

- Root cause: `capsOf` correctly omits a recursive declaration from its own closure environment, and `readSym` uses the receiver for direct recursion. A nested callback instead requests the declaration's shared cell through `storageOf`, which read an undefined SSA variable. `storageOf` now initializes that callback's cell from the closure receiver using the existing declaration/cell lowering. The recursive closure does not retain the new cell, so this adds no self-reference cycle; no verifier, type coercion, runtime or application workaround changed.
- Scope: four lines in `src/ir/lower.cpp`, one exact T0 with its fixture/output and affected mapping, changelog, and this task. Read all `storageOf`, `readSym`, `declSym`, capture and forward-function callers. Protected runtime/HAL/UI files untouched.
- Research: ECMAScript FunctionDeclarationInstantiation and function declaration instantiation capture the lexical environment, supporting the current closure/cell model: https://tc39.es/ecma262/multipage/ecmascript-language-functions-and-classes.html#sec-functiondeclarations . Existing engine lowering supplies the needed machinery; no library or new abstraction is needed. Coordinator performed the primary lookup because Sonnet was unavailable.
- Proof: `tools/build zinc` completed; no warning from edited IR code. The cold build reports existing V8 SDK/vendor warnings and existing assets/cook/agent initializer warnings, recorded in `.logs/recursive-local/build.log`; do not claim a warning-free whole tree.
- `tests/run --only recursive_local` passed on interpreter, AOT and QuickJS. Exact fixture constructs the natural timer recursion, runs bounded nested callbacks, rejects stale generation callbacks after stop/restart, and compares expected `built/0/3`. `ZN_LEAK_CHECK=1` passes (interpreter/AOT), and an additional no-optimization interpreter run also passes without leaks. The unchanged common engine fails the same fixture with `@lambda3:construct/poll ... const of a non-scalar type`, establishing the regression.
- Fixture `zinc check` passes. Original Music copied without source edits into `.logs/recursive-local/music` checks and runs headless interpreter for two frames; full muted app proof is being run by Music worker on this candidate.
- Candidate binary: `/Users/mowmow/Lab/zinc/.worktrees/1116/build/zinc`, SHA256 `a5097ef368ac17152ffb70383979402865d0724283824eff0c994f796bd06d1e`, adjacent AOT archives present. `src/ir/lower.cpp` SHA256 `9b326662941b1986f30fcc263d6b9bca462c8c606fe6770be581278e9f67600a`; original Music state SHA256 `60f6d0f95886a0ada0bb442416232e86559e0a85a05eb2cbc96147d62f7f3b79`.
- Logs: `.logs/recursive-local/{build.log,baseline.log,noopt.log,t0.log,check.log,music-check.log,music-interp.log}`. All runs bounded through coordinator `tools/work-run`; no owned process remains. `tools/usage`: `usage: n/a`.

**Proposed tests**
- Owner-picked longer original Music playback/stop/restart/unmount churn on all engines and cross-platform machines; proves long-lived resource behavior, minutes, memory unmeasured. No suite, benchmark, conformance, fuzz, pixel comparison or CI was run.

- AC2 confirmed by Music worker on the exact candidate SHA above: unchanged original App callbacks (search/select/Enter play/pause/waveform and volume keys/next-previous/queue move-remove/theme), real audio provider seek/position/stop/owned subtree dispose, and separate unchanged model queue completion/unique bound/missing-asset failure and retry/eight open-close churn/stale poll all PASS on interpreter, AOT and QuickJS. Six bounded serialized commands use muted/null audio; no process remains. Evidence inspected at `/Users/mowmow/Lab/zinc/.worktrees/1078.26/.logs/music1078.26/candidate-{callbacks,model}-{interp,native,quickjs}.log`. `state.ts` SHA remains `60f6d0f95886a0ada0bb442416232e86559e0a85a05eb2cbc96147d62f7f3b79`.
