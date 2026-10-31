---
id: ZN-914
title: 'discord: real code composer (zinc:editor tab), collapsed code blocks, fluid UI'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-31 08:40'
updated_date: '2026-10-31 08:55'
labels:
  - discord
  - ui
dependencies: []
ordinal: 608460
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-31: the code button must open a real editor from the shared zinc:editor plugin (the one extracted from Atelier, shared with zed-editor): syntax colouring, copy/paste, no raw backtick fence to type. Sending produces the Discord markdown (fence with language); reading shows the block highlighted, folded by default, unfold on click. Smooth interactions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Code tab in the composer hosts zinc:editor with language choice, highlighting, copy and paste
- [x] #2 Send turns it into a fenced block with its language
- [x] #3 Read: code blocks fold by default (first lines and a Show code toggle) and unfold with an animation
- [x] #4 Frames checked
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Code tab: CodeInsert.tsx hosts zinc:editor CodeEditor (language list, highlight, copy, paste, Cmd+Enter sends); sendWithCode joins text and a fenced block. CodeBlock folds over 6 lines (Show code, eased height). Frames checked (folded, unfolded, tab). Test: tests/t1/discord_code.sh. Languages without a zinc:editor tokenizer (py, rust...) are plain coloured: later.md.
<!-- SECTION:NOTES:END -->
