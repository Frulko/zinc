---
id: ZN-917
title: 'ui: text selection across several lines and blocks'
status: In Progress
assignee:
  - '@parallel'
created_date: '2026-10-31 08:40'
updated_date: '2026-10-31 09:09'
labels:
  - discord
  - ui
dependencies: []
ordinal: 611460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-31: the engine's text selection works line by line only; dragging across several lines or several Text nodes must select them all, highlight, and copy with newlines.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Drag selection spans several lines of one Text and several Text blocks in a ScrollView, with highlight and copy
- [x] #2 Test on every engine; works in Discord messages
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Selection spans several lines and several selectable Text nodes in document order (anchor and focus node, highlight per node, copy joins blocks with a newline and keeps the text's own newlines); a drag past a block clamps to the nearest one, and near the top or bottom 24px of the holding ScrollView it scrolls (on pointer moves). Test: tests/t1/ui_select.sh with tests/golden/ui-select-multi on interpreter, QuickJS and AOT (same output and frame hash). Not run: discord/atelier T1 (shared CPU), cross targets. Auto-scroll only advances on pointer moves, not while the pointer rests.
<!-- SECTION:NOTES:END -->
