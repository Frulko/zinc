---
id: ZN-993
title: 'Harden state: reactivity and UI guards survive a throw'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-06 07:22'
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
- [ ] #1 solid.ts batch/run/untrack restore batchDepth, current and owner when the function throws; a regression test shows signals still flush after a throwing effect
- [ ] #2 react.ts rerender restores cur and ends the child update when a render throws
- [ ] #3 ui.ts re-entrancy flags (inVirt, inFields, inSettle, childUpdateDepth, inTween, inStyle) and paintLayers hidden/bgAlpha flips are restored by try/finally
- [ ] #4 ui.ts release(h) clears every gesture and edit reference to h (dragScroller, tapEdit, grabber, tapNode, longNode, padScroller, momScroller, fingerField...) so a recycled handle is never driven by stale state; regression test
<!-- AC:END -->
