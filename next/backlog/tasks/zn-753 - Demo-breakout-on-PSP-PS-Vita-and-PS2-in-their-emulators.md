---
id: ZN-753
title: 'Demo: breakout on PSP, PS Vita, PS2 and Nintendo 3DS, in their emulators'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-17 07:48'
updated_date: '2026-10-17 09:24'
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

2026-10-17 (owner): "pour les assets prends sur kenney.nl, c'est plus joli": every 2D and 3D game demo uses Kenney's assets (CC0), adapted per platform. Breakout gets a Kenney skin ("Puzzle Pack": paddles, balls, bricks; a background; Kenney's interface sounds) drawn as sprites, keeping its logic; the prototype's frozen breakout goldens stay what they are (record the divergence as the owner's choice) and Zinc Next's breakout goldens are re-recorded.

2026-10-17 (owner): PCSX2 2.8.2 is installed and configured on the development Mac with the owner's own BIOS (/Applications/PCSX2-v2.8.2.app; games folder /Users/mowmow/Documents/ps2): it is the PS2 runner here; Play! stays the fallback for machines without a BIOS. The PS2 demo ELFs are copied into /Users/mowmow/Documents/ps2 for the owner to start from PCSX2. The BIOS is never copied or committed.

2026-10-17, the owner tried the hello demos in ~/Documents: PSP shows it; PS2 (PCSX2 from its game list) a black screen; Vita (Vita3K) prints 'hello from zinc on vita' then zinc:exit 0 after 40 ms and closes (the copied demo ends instead of looping); 3DS not reported yet. The console tests passed because the PS2 and 3DS shots read the HAL's own buffer, not what the emulator displays: fix these first and prove them on the emulator's real output (its window screenshot or video).
<!-- SECTION:NOTES:END -->
