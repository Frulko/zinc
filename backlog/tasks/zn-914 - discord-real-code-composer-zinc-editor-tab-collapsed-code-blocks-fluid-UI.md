---
id: ZN-914
title: 'discord: real code composer (zinc:editor tab), collapsed code blocks, fluid UI'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-31 08:40'
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
- [ ] #1 Code tab in the composer hosts zinc:editor with language choice, highlighting, copy and paste
- [ ] #2 Send turns it into a fenced block with its language
- [ ] #3 Read: code blocks fold by default (first lines and a Show code toggle) and unfold with an animation
- [ ] #4 Frames checked
<!-- AC:END -->
