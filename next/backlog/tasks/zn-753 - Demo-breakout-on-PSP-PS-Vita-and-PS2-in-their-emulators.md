---
id: ZN-753
title: 'Demo: breakout on PSP, PS Vita, PS2 and Nintendo 3DS, in their emulators'
status: Backlog
assignee: []
created_date: '2026-10-17 07:48'
updated_date: '2026-10-17 08:38'
labels:
  - handheld
  - games
  - size-L
milestone: m-23
dependencies:
  - ZN-457
ordinal: 214500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-17: "une vraie démo" on PSP, PS Vita and PS2: simpler than the phone demos because the machines are limited, but with animation and input. examples/breakout (animation, the gamepad through zinc:gfx isDown/wasPressed and Btn, text, score, lives) runs unchanged on each console at its screen size (PSP 480x272, Vita 960x544, PS2 640x448 NTSC), letterboxed or responsive as zinc.json says, driven by the console's own pad. Built on the handheld chain (ZN-453 ids and profiles, ZN-454 console system host, ZN-455 portable core, ZN-456 SDK pins, ZN-457 emulator runners, ZN-458/ZN-459 hello, ZN-463/ZN-464 bouncing ball) and on targets/ps2 (the prototype's PS2 HAL). Emulators: PPSSPP (no firmware needed), Vita3K (with Sony's freely downloadable firmware PUP), Play! for the PS2 (it boots homebrew ELFs without a BIOS; PCSX2 needs the owner's own BIOS dump, which cannot be downloaded).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 breakout runs in PPSSPPHeadless and in PPSSPP's window: a scripted pad session (serve, move, break bricks, lose a life) gives frame hashes and a screenshot; frame time on the emulator's software and GPU modes
- [ ] #2 the same in Vita3K with the Vita's pad
- [ ] #3 the same in Play! for the PS2 with its pad
- [ ] #4 a short video or screenshot series per console in docs/reports/zinc-next-consoles.md, with the frame times and what each port needed
- [ ] #5 the same in Azahar for the Nintendo 3DS (top screen 400x240, the circle pad and buttons)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-17 (owner): the Nintendo 3DS joins (devkitARM, libctru/citro3d/citro2d, Azahar).
<!-- SECTION:NOTES:END -->
