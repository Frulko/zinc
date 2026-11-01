---
id: ZN-935
title: 'Murdoku pen input: circled letter places, bare letter notes, X crosses'
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-01 12:12'
updated_date: '2026-11-01 14:58'
labels:
  - demo
  - ink
  - size-M
milestone: m-29
dependencies:
  - ZN-927
  - ZN-933
  - ZN-934
ordinal: 629460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Strokes are grouped and attributed to cells; circled letter = place, bare letter = note, X = cross, unknown stays as ink; the typeset glyph replaces the ink; two-finger tap undoes. Only the existing place, toggleNote and toggleCross actions are emitted so deduction.ts stays the rule source. Design, scores and context: docs/reports/murdoku-eink-handwriting.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A scripted pen session (stroke JSON replay) ends in the expected state on the Mac
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Pen input: examples/murdoku/src/pen.ts (grouper, cell attribution at 60 % of the box, recogniseAsync with the A-E/V/circle/x classes and priors 0.2 for placed letters, then place / toggleElimination only; recognised ink erased, unknown or refused marks stay; refreshRect quality on the cell), overlay Canvas in Board.tsx on the e-ink skin, undo now restores notes too (state.ts). Engine: ui.onTwoFingerTap (lib/std/ui.ts), Ink.overlay (an opaque baked page image covered the plan). tests/t1/murdoku_pen.sh: MURDOKU_PEN_REPLAY (src/replay.ts) replays marks from held-out dataset strokes: circled A places, bare B notes, X crosses, line stays ink, two-finger tap undoes. Run on the interpreter only; not on a panel (real Marker, palm rejection, debounce tuning are ZN-938). Not done: hint swipe.
<!-- SECTION:NOTES:END -->
