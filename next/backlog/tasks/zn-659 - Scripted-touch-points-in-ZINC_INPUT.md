---
id: ZN-659
title: Scripted touch points in ZINC_INPUT
status: Done
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
- [x] #1 a script with two simultaneous touches gives the expected touch log on the interpreter and the AOT (golden)
- [x] #2 existing input scripts and their goldens are unchanged
- [x] #3 the input script reference (docs/reports/zinc-next-window.md) documents the syntax
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done by the museum-table agent as commit 611f27b9 (20 lines in next/src/host/hal_dispatch.cpp): `<frame> touch ID X Y` and `<frame> touchup ID`, up to 10 fingers held, in landing order, the first finger also being the pointer. tests/t1/input_touch.sh (PASS on the compiled program and on the interpreter, coordinator's run), tests input and pointer_kind unchanged. The syntax is documented where the input script is, docs/reports/zinc-next-window.md, not in the guide.
<!-- SECTION:NOTES:END -->
