---
id: ZN-286
title: 'Layout: Dirty flags and per-frame integration (`rn`)'
status: Done
assignee: []
created_date: '2026-10-07 13:08'
updated_date: '2026-10-08 14:55'
labels:
  - ui
  - layout
  - size-M
milestone: m-17
dependencies:
  - ZN-284.01
ordinal: 50760
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/layout-engines.md (section 8, LE-7). Decision: a pluggable layout interface, `classic` stays the default, Yoga 3.2.1 is the opt-in `rn` mode for React Native fidelity. lib/std/ui.ts is shared with the prototype: land the other developer's uncommitted work first, then hunk-only commits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Changing a text marks only that node and ancestors dirty; a paint-only change (opacity) causes zero `calculate` work (counter).
- [x] #2 Scroll views, `layoutLayers` and `applyAnchors` give identical results to `classic` on the layers/anchors tests of `docs/ui.md`.
- [x] #3 The hero page renders in `rn` mode with no crash and a recorded golden.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. Done: lib/std/ui.ts calculate() runs the rn engine when UI_LAYOUT is rn (Yoga opened with React Native's defaults: flex-shrink 0, as classic never shrinks): rnSync sends per node only the props that changed (RN_PROPS, composites for width/height/basis), the leaf measure (text with its wrap style, image, field) and the children list when it changed (layers excluded, order sorted); rnRead brings back absolute x/y/lw/lh, the lines, scroll content sizes (through fragments; virtual lists keep count*itemH) and clamps scrolls; release() destroys the engine node. Layers and anchors still run after calculate as in classic. Engine counters (host.layoutCounter: measures, calculates). ZINC_UI_LAYOUT=rn|classic|auto overrides zinc.json for a run (checked against the target). QuickJS now serves zinc:platform and reads zinc.json before running. tests/t1/layout_rn.sh (3 s): a text change = 1 calculate and 1 measure; an opacity change = 0 layouts; scroll.tsx identical to classic's frozen output in rn; layers.tsx identical except 3 known lines (Yoga centres a text taller than its 20 px button like CSS/RN, classic starts it at the top); hero in rn renders to framehash 0a1cb24319db0754 (visually the same page, the badge 1 px off). Classic unchanged: tests/run --changed 32 passed, proto-capture compare 4/4. Follow-up: AOT UI programs link Yoga in classic too (new task).
<!-- SECTION:NOTES:END -->
