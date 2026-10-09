---
id: ZN-473
title: 'Vita: touch, IME and the UI demo'
status: Backlog
assignee: []
created_date: '2026-10-09 07:38'
labels:
  - handheld
  - handhelds
  - ui
  - vita
  - size-M
milestone: m-23
dependencies:
  - ZN-471
ordinal: 300200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Front touch to HalTouch (multitouch, panel grid scaled to 960x544), back touch as scroll and pinch, sticks as scroll and cursor, sceImeDialog for hal_text_input, confirm button swap; density option.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/hero runs unchanged at 960x544 in Vita3K with scripted touch reaching three screens
- [ ] #2 IME text reaches a field (hardware if Vita3K lacks the IME)
- [ ] #3 60 fps on idle screens
<!-- AC:END -->
