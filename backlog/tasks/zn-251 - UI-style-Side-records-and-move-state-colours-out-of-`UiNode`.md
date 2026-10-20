---
id: ZN-251
title: 'UI style: Side records and move state colours out of `UiNode`'
status: Done
assignee: []
created_date: '2026-10-07 12:56'
updated_date: '2026-10-08 10:38'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-250
ordinal: 50510
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-02). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Hover, focus, active, focus-within colour tests and the hero focus frame unchanged.
- [x] #2 Bytes per node and a 171-node page measured with `zinc mem`: at least 15% lower.
- [x] #3 A node with no extended property allocates no side record (assert in a T0 test).
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. 54 cold fields moved into four copy-on-write records shared by every node that has none of them: RingX (ring/outline), BorderX (dashed/dotted, per-side colours and widths, per-corner radii), SnapX (scroll snap), InterX (focus/active/hover/within colours, transitions); reads keep the old names through getters (ui.inspectNode users), writes go through ownRg/ownBd/ownSn/ownIt; setClass resets to the shared defaults (the transition state curBg/fromBg/transStart stays). The per-node empty arrays (sheets, sheetKeys/Vals/Ids, attrK/V) are shared empties. zinc mem on a 171-node page: UiNode bytes 531552 -> 409512 (-23%), peak object bytes 331071 -> 228967 (-31%), allocations 5947 -> 3918. AC1: ui_* goldens, ui-tokens and the 4-entry canary unchanged. AC3: tests/t0/ui_sides.sh. Behaviour change: a node that never had a transition or a state colour does not remember its last background, so adding transition-colors later does not animate from the old colour. ui-alloc-text golden updated (431/455/600/67, lower than before).
<!-- SECTION:NOTES:END -->
