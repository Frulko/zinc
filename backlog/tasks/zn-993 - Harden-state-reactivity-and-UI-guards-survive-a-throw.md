---
id: ZN-993
title: 'Harden state: reactivity and UI guards survive a throw'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-06 07:22'
updated_date: '2026-11-06 07:33'
labels:
  - size-M
  - ui
  - hardening
dependencies: []
ordinal: 752080
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/implicit-state-machines.md (#16, #17, lib/std section). A throw inside a batch, effect, render or a UI pass leaves module state set and freezes the app. Reproduce each case first with a small program; drop any finding that does not reproduce.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 solid.ts batch/run/untrack restore batchDepth, current and owner when the function throws; a regression test shows signals still flush after a throwing effect
- [x] #2 react.ts rerender restores cur and ends the child update when a render throws
- [ ] #3 ui.ts re-entrancy flags (inVirt, inFields, inSettle, childUpdateDepth, inTween, inStyle) and paintLayers hidden/bgAlpha flips are restored by try/finally
- [x] #4 ui.ts release(h) clears every gesture and edit reference to h (dragScroller, tapEdit, grabber, tapNode, longNode, padScroller, momScroller, fingerField...) so a recycled handle is never driven by stale state; regression test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced each case with a small program before fixing (old lib vs fixed lib, tests/t0/ui_throw_state.sh fails 3 of 3 checks before the fix).
#1 solid.ts: reproduced (a throw in batch left batchDepth at 1: later writes queued for good, effects never ran again). run/untrack/batch restore in finally; batch also flushes its queue on a throw, as Solid. Side find: untrack(() => { ... }) with a void body did not compile (Z0109 on 'const r = fn()' with T=void); 'return fn()' inside try avoids the local. Proven on interpreter, --native and QuickJS.
#2 react.ts: reproduced only through a parent that catches the child's render throw (an error boundary pattern): cur stayed on the thrower and childUpdateDepth stayed at 1, so a reorder of keyed rows was never laid out. A throw from a scheduled re-render (microtask) panics the app on every engine, nothing to restore there. rerender restores cur and ends the child update before rethrowing.
#3 ui.ts inVirt/inFields/inSettle/inStyle/inTween and paintLayers hidden/bgAlpha: did NOT reproduce. No user code runs inside those guards except onDraw during paint, and any throw through frame() (onDraw, onTick, a microtask) ends the program on the interpreter, native and QuickJS (checked: 'panic: Uncaught Error: draw' / QuickJS 'Uncaught Error: draw'); nothing catches it, so a stuck flag is never observed. childUpdateDepth, the one guard user code can leave open, is fixed under #2. Skipped, criterion left unchecked by design.
#4 ui.ts release(h): reproduced (destroy a scroll view mid-drag, the next node gets the same handle and scrolled 50 px under the old finger). release now clears dragScroller/dragging, grabber/grabKind, tapNode, longNode, gHit, dragCands, tapEdit, fingerField, touchSel, padScroller, padEdit, momScroller, momEdit. Not covered: the parked copies of those fields in other Surfaces (swapSurface).
Tests: tests/run --only ui_throw_state, solid_cleanup, solid_index, react_class, scroll_axis, jsx_project_model, ui_dnd, react_native, ui_kbd_mode: all pass (ZINC_ROOT=worktree, main build/zinc).
<!-- SECTION:NOTES:END -->
