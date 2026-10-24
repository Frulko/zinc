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
ordinal: 247000
updated_date: '2026-10-25 01:53'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: merged into ZN-472. Vita touch/back touch exist in the hardware demo; the IME part is the same task as ZN-472. Evidence: examples/hardware-vita; commit c973e863 Verifier: No console implements hal_text_input (grep of targets/: only hal_sdl.cpp), so the IME is open everywhere; ZN-472 is open. Carry over sceImeDialog, hero at 960x544 with scripted touch in Vita3K and idle 60 fps: it is a different system API from PSP's OSK, so 472 must name each console.
<!-- SECTION:NOTES:END -->
