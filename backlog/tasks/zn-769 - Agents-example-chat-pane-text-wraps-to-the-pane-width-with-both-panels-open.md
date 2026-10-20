---
id: ZN-769
title: 'Agents example: chat pane text wraps to the pane width with both panels open'
status: Done
assignee: []
created_date: '2026-10-20 13:20'
updated_date: '2026-10-20 13:20'
labels:
  - examples
  - desktop
  - ui
  - layout
  - size-S
milestone: m-16
dependencies:
  - ZN-768
ordinal: 500450
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner report (2026-10-20, a 2000x1300 window at 2x): with the Agents side panel and the detail panel open, the chat pane's content (the message bubble, markdown paragraphs, list items, inline code, the composer) is laid out wider than the pane and clipped on its right edge. Every text in the pane must wrap to the pane's current width whatever side panel is shown, with the detail panel open or closed and when the window is resized; long paths and URLs break; code blocks and tables never push the pane wider.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Root cause found and fixed where all layouts route through: classic measured each child of a row at the whole row's width and flex-shrink only narrowed the boxes, so texts kept the lines of the wider width; a shrunk item (and a child wider than its column) is now laid out again at its final width, with CSS's freeze loop for min-width (lib/std/ui.ts, own fix(ui) commit, tests/golden/classic-shrink)
- [x] #2 `break-words` cuts a word longer than the line in a text with style runs (tests/golden/ui-runs), and the example's texts use it: paths, URLs and inline code break
- [x] #3 The pane's header tabs, the settings pills and the composer fit a narrow pane (they wrap or shrink); code blocks wrap inside their box
- [x] #4 tests/t1/agents_markdown.sh: at 1440 and 900 px with the Agents and detail panels open, after switching side panels, closing and opening the detail panel and turning the window, no text of the chat pane passes its right edge
<!-- AC:END -->
