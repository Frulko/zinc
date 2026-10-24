---
id: ZN-472
title: 'Console text input and focus navigation: OSK (PSP), IME (Vita), swkbd (3DS) behind hal_text_input'
status: Backlog
assignee: []
created_date: '2026-10-09 07:38'
labels:
  - handheld
  - handhelds
  - psp
  - ui
  - size-M
milestone: m-23
dependencies:
  - ZN-468
ordinal: 51600
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** hal_text_input on each console (sceUtilityOsk, sceImeDialog, swkbd), d-pad focus navigation and a pointer from the nub/stick for zinc:ui apps; proof with examples/hardware-kit or a small form in the emulators with a scripted pad; hardware check noted. Old devices use the zinc:gfx tree, so keep it to apps that opt in.

D-pad and Cross focus navigation, a virtual cursor on the analog nub (Select toggles), confirm button from the system setting, sceUtilityOsk for hal_text_input, a compact theme for 480x272.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/ui/kit-gallery runs unchanged (only zinc.json targets.psp) in PPSSPP with scripted input reaching three screens
- [ ] #2 OSK text reaches a text field (PPSSPP or hardware)
- [ ] #3 idle screens stay at 60 fps with damage tracking
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. The kit-gallery it names is gone and the hardware demos already map pad, touch and sticks per console; what is missing is text input and zinc:ui focus navigation. Merges 473 and 474 (same job, three APIs). Evidence: no sceUtilityOsk/sceImeDialog/swkbd in targets/*/hal_*.cpp; examples/hardware-kit
Review 2026-10-25: merged ZN-473 here (Vita: touch, IME and the UI demo). Carry over: Vita touch/back touch exist in the hardware demo; the IME part is the same task as ZN-472. No console implements hal_text_input (grep of targets/: only hal_sdl.cpp), so the IME is open everywhere; ZN-472 is open. Carry over sceImeDialog, hero at 960x544 with scripted touch in Vita3K and idle 60 fps: it is a different system API from PSP's OSK, so 472 must name each console.
Review 2026-10-25: merged ZN-474 here (3DS: screens, touch, swkbd and the UI demo). Carry over: 3DS touch and bottom screen exist (hardware demo, bottom window on the GPU); swkbd is the same task as ZN-472. Same as ZN-473: carry swkbd, targets.n3ds.screen top|bottom|both and the UI demo criterion (kit-gallery is gone: use examples/hardware-n3ds or hero).
<!-- SECTION:NOTES:END -->
