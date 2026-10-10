---
id: ZN-659
title: Scripted touch points in ZINC_INPUT
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-10 18:17'
labels:
  - testing
  - touch
  - size-S
milestone: m-27
dependencies: []
ordinal: 412410
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
(Owner's answers, 2026-10-10, for the showcase demos of M27.) Found by the backlog review: the input script reads move, down, up, wheel, key and text only, so a multi-touch session (two hands on two photo cards, pinch, rotate) cannot be scripted and tested. Touch down, move and up with an id, several at the same time, feeding touchCount / touchX / touchY / touchId of zinc:gfx.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a script with two simultaneous touches gives the expected touch log on the interpreter and the AOT (golden)
- [ ] #2 existing input scripts and their goldens are unchanged
- [ ] #3 docs/guide/06-testing.md documents the syntax
<!-- AC:END -->
