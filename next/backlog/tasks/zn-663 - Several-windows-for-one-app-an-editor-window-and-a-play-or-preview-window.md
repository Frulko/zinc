---
id: ZN-663
title: 'Several windows for one app: an editor window and a play or preview window'
status: Backlog
assignee: []
created_date: '2026-10-10 18:26'
labels:
  - desktop
  - editor
  - size-M
milestone: m-27
dependencies: []
ordinal: 419410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Owner's answer, 2026-10-10: wanted for the editors of the showcase demos, behind the demos themselves.) An app opens more than one window (the second half of ZN-249, never split out): each with its own surface, input and frame callback, sharing the program's state; closing the last one ends the app. The pinball table editor and the museum storyboard editor then keep the editing window and the played table or the previewed sequence side by side.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a program opens two windows, draws a different frame in each and receives input for each (scripted test, two pixel goldens)
- [ ] #2 closing one window keeps the other; closing the last one ends the program
- [ ] #3 zinc:ui renders a tree per window
- [ ] #4 docs/guide documents the API
<!-- AC:END -->
