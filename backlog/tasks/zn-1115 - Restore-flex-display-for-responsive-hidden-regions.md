---
id: ZN-1115
title: Restore flex display for responsive hidden regions
status: Backlog
ordinal: 1259
milestone: m-32
labels:
  - ui
  - size-S
assignee:
  - '@parallel'
created_date: '2026-11-10 02:53'
labels: []
dependencies: []
ordinal: 992000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Notes and Assistant desktop areas remain hidden with natural className hidden md:flex. lib/std/ui.ts apply utility flex returns true without clearing hidden; width1080 repro reports Detail(hidden). Minimal4line Notes source and log .logs/blockers/responsive-display/responsive-gap.tsx/.log, Assistant original also fails at1100. Fix shared display utility semantics rather than substitute classes/conditional app views. Cover responsive reveal and hide over resize, base flex after hidden, breakpoint/order behavior and layout/focus accessibility across all3. Primary short reference https://tailwindcss.com/docs/display (hidden displaynone vs flex displayflex; responsive display variants). Limited isolated worktree carveout: ONLY display token handling near2956, away from main external Map/Fenwick WIP639/1074; preserve that external patch byte-for-byte at integration. No virtualization/runtime/HAL/other engine edits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Natural hidden md:flex and supported display utilities show and hide the same node correctly as breakpoints change, including normal class updates, layout and focus eligibility
- [ ] #2 Small exact T0 all3 and unchanged Notes plus Assistant desktop/mobile repros pass; no caller rewrite and unchanged kit size limits
<!-- AC:END -->
