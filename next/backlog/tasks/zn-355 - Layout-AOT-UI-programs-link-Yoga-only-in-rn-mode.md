---
id: ZN-355
title: 'Layout: AOT UI programs link Yoga only in rn mode'
status: Backlog
assignee: []
created_date: '2026-10-08 14:55'
labels:
  - ui
  - layout
  - aot
milestone: m-17
dependencies:
  - ZN-286
ordinal: 123000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found in ZN-286: lib/std/ui.ts references the zinc:__layout rows behind `if (RN)` (RN = UI_LAYOUT === 'rn'), so usesLayout is true for every UI program and the AOT links zn_layout and zn_yoga even in classic. Fold the constant (UI_LAYOUT is known at compile time: the IR can drop the dead branch) or decide usesLayout from the resolved layout; measure the size of a classic hero binary before and after.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a classic AOT build of examples/hero has no YG symbol (nm) and an rn build has them
- [ ] #2 the size saved is recorded in the notes
<!-- AC:END -->
