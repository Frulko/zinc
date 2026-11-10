---
id: ZN-1114
title: Honor reduced motion in shared layer transitions
status: Backlog
assignee: []
created_date: '2026-11-10 02:48'
labels:
  - ui
  - size-S
milestone: m-32
dependencies: []
ordinal: 1240.2
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Original Mail compose and shared Dialog/Sheet animate scale/slide even with ui.prefersReducedMotion true. Public ui.openLayer scale duration340 minimum17lines and20paint logs in .logs/blockers/layer-reduced-motion/reduced-layer-core.ts + reduced-layer-core-{interp,native,quickjs}.log. All3 flagtrue, paint2p0,paint3p0.1399678479,paint6p0.4804336190,paint20p0.9983716670. Natural app uses unchanged kit; do not add per-app animationnone workaround. Determine intended shared layer/provider ownership, then honor reduced motion at common layer entry/step/exit including toggled preference, input/focus/cleanup. lib/std/ui.ts currently has another session sparseMap/Fenwick uncommitted WIP; coordinator choosing rule protects that file, no worker may alter it while held. Keep task open with precise handover until safe shared correction can be made. Primary short research https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html. No owner question; independent backlog continues.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Dialog Sheet and public shared layer transitions honor reduced motion on open and close and when preference changes, preserving final geometry focus and lifecycle cleanup
- [ ] #2 Exact small T0 and original unchanged Mail compose reduced-motion proofs pass all3; public kit size thresholds remain unchanged
<!-- AC:END -->
