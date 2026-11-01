---
id: ZN-934
title: Murdoku e-ink skin with portrait and landscape layouts
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-01 12:12'
updated_date: '2026-11-01 14:40'
labels:
  - demo
  - rmpp
  - size-M
milestone: m-29
dependencies:
  - ZN-928
  - ZN-929
  - ZN-930
ordinal: 628460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
E-ink theme (patterns per room, line-art decor), board layer and UI layer, layouts from the size signal, zinc.json target rmpp. Design, scores and context: docs/reports/murdoku-eink-handwriting.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Emulator frames at 1620x2160 and 2160x1620 (and 1404x1872 mono) show no gradient or tint, one golden each
- [x] #2 The Mac app is unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
E-ink skin: examples/murdoku/src/skin.ts (INK from zinc:ui EINK), components/InkPlan.ts (pattern per room, line-art decor, windows), Portrait as a letter token, no veils/transitions/tints; zinc.json targets.rmpp (1620x2160, display rmpp; app.orientation landscape gives 2160x1620 as before). Layout comes from the size signal (compact() below 1100 wide or portrait). tests/t1/murdoku_eink.sh: three frames (1620x2160, 2160x1620, 1404x1872) grey-only and equal to tests/golden/murdoku-eink/*.hash, PNGs kept beside. Engine fixes found on the way: zinc:icons ignored e-ink snapping (near-grey tint); a nested function called by name ignored the defaults of omitted parameters (null / 0), fixed in src/ir/lower.cpp with tests/t0/nested_default.sh. Not done: board/UI layer-cache and refreshRect use (the plan Canvas is already lazy, so it repaints only on change); mono panel has no separate palette, the skin is black and white on every panel. Later: the font scale of 1.5 (setFontScale) did not enlarge captions visibly; check on the panel.
<!-- SECTION:NOTES:END -->
