---
id: ZN-753
title: 'Demo: breakout on PSP, PS Vita, PS2 and Nintendo 3DS, in their emulators'
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-17 07:48'
updated_date: '2026-10-17 10:16'
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
- [x] #2 the same in Vita3K with the Vita's pad
- [ ] #3 the same in Play! for the PS2 with its pad
- [x] #4 a short video or screenshot series per console in docs/reports/zinc-next-consoles.md, with the frame times and what each port needed
- [x] #5 the same in Azahar for the Nintendo 3DS (top screen 400x240, the circle pad and buttons)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-17 (owner): the Nintendo 3DS joins (devkitARM, libctru/citro3d/citro2d, Azahar).

2026-10-17 (owner): "pour les assets prends sur kenney.nl, c'est plus joli": every 2D and 3D game demo uses Kenney's assets (CC0), adapted per platform. Breakout gets a Kenney skin ("Puzzle Pack": paddles, balls, bricks; a background; Kenney's interface sounds) drawn as sprites, keeping its logic; the prototype's frozen breakout goldens stay what they are (record the divergence as the owner's choice) and Zinc Next's breakout goldens are re-recorded.

2026-10-17 (owner): PCSX2 2.8.2 is installed and configured on the development Mac with the owner's own BIOS (/Applications/PCSX2-v2.8.2.app; games folder /Users/mowmow/Documents/ps2): it is the PS2 runner here; Play! stays the fallback for machines without a BIOS. The PS2 demo ELFs are copied into /Users/mowmow/Documents/ps2 for the owner to start from PCSX2. The BIOS is never copied or committed.

2026-10-17, the owner tried the hello demos in ~/Documents: PSP shows it; PS2 (PCSX2 from its game list) a black screen; Vita (Vita3K) prints 'hello from zinc on vita' then zinc:exit 0 after 40 ms and closes (the copied demo ends instead of looping); 3DS not reported yet. The console tests passed because the PS2 and 3DS shots read the HAL's own buffer, not what the emulator displays: fix these first and prove them on the emulator's real output (its window screenshot or video).

2026-10-17 (agent): why the owner saw black and a closing app: the ~/Documents hello copies were the one-line text program of console_emulators (console.log only, nothing drawn): PCSX2 showed the black screen it was given, Vita3K closed the app when main returned. Fixes (commit 'fix(console)'): the core's text screen (a program that ends with nothing drawn or with an error keeps its last lines on the screen until START/HOME/the frame budget, zinc:exit after it); targets/console/hello (text + moving square until the console quits it) copied by tools/console-demos with no --frames; shots from what the screen shows: PPSSPP screenshot, PCSX2 save-state Screenshot.png (SaveStateOnShutdown in the runner's own data dir; the PS2 core holds its last frame after zinc:exit), Vita sceDisplayGetFrameBuf readback, 3DS readback of the shown buffer (Vita3K and Azahar offer no scriptable screenshot; Azahar -d needs libvpx, absent from its bundled FFmpeg with the owner's default dump settings; window capture needs Screen Recording). Bugs found that way: PS2 PAL 640x512 showed stale VRAM under the 448-row frame (centred + cleared); 3DS double buffer got only damaged rows in one buffer (per-buffer stale rows). Also: --input pad session, --env, --title/--id/--size, sticks/circle pad as d-pad, Vita 444 MHz and whole-factor scaling, PS2 hal_env, runner SIGKILLs an emulator that ignores SIGTERM (Azahar left 6 instances behind). Breakout: Kenney Puzzle Pack 1.1 skin (src/skin.ts, assets/kenney + License.txt), logic unchanged, render.ts keeps the old look (breakout-mods, prototype frame; manifest breakout row skipped as the owner's choice). Pad session tests/golden/breakout/pad.input; last-frame hash equals zinc run --interp on PSP, Vita (480x272 doubled) and 3DS; PS2 same game, colours within 3% (EE FPU rounds toward zero), own hash in pad.hashes column 4. Frame times and pictures: docs/reports/zinc-next-consoles.md. AC#3 stays open: the PS2 runs in PCSX2 (the owner's runner since 2026-10-17), not in Play!. Owner copies: ~/Documents/{psp/breakout/EBOOT.PBP, vita/breakout.vpk, ps2/breakout.elf, 3ds/breakout.3dsx} and zinc-hello beside them.

Open for the owner (Review): AC#1's PPSSPP window run (PPSSPPSDL.app; tools/console-run psp <EBOOT> --window or the copy in ~/Documents/psp/breakout) and AC#3's Play! run (Play! takes the focus: it does not start under open -g; tools/console-run ps2 <elf> --emu play). PPSSPP's GPU backends give the same frame times: the core writes VRAM itself (measured on --graphics=software). Verified here: console_host, console_core, handheld_profiles, breakout_pad, framehash; QuickJS draws breakout's frame 20 like the interpreter; console_emulators: see the integration run.
<!-- SECTION:NOTES:END -->
