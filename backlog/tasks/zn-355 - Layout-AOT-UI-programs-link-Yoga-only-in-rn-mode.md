---
id: ZN-355
title: 'Layout: AOT UI programs link Yoga only in rn mode'
status: Done
assignee: []
created_date: '2026-10-08 14:55'
updated_date: '2026-10-08 19:18'
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
- [x] #1 a classic AOT build of examples/hero has no YG symbol (nm) and an rn build has them
- [x] #2 the size saved is recorded in the notes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a
Done: the AOT installs and links the layout engine (zn_layout, Yoga) only when the program is compiled for rn or a module other than zinc:ui imports zinc:__layout (frontend directLayoutUse, set by the module loader); emitCpp takes the choice. examples/hero AOT: classic 20,161,056 bytes with 0 YG symbols, rn 20,297,208 bytes with 152: 136,152 bytes saved in classic (__TEXT 18,448,384 -> 18,350,080). tests/t2/aot_layout_link.sh (about 50 s, milestone): a small UI program, 7,419,192 classic without Yoga vs 7,556,496 rn with it. layout_bridge (imports zinc:__layout directly) still builds and runs in classic. tests/run --changed 51/51.
Chosen over folding UI_LAYOUT in the IR: the resolved layout is already known when the AOT links, and folding module-level constants across functions is not in the IR.
<!-- SECTION:NOTES:END -->
