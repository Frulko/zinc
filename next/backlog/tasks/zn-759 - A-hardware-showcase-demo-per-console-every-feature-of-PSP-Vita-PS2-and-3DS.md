---
id: ZN-759
title: 'A hardware showcase demo per console: every feature of PSP, Vita, PS2 and 3DS'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-10-17 09:39'
labels:
  - handheld
  - games
  - size-L
milestone: m-23
dependencies:
  - ZN-753
ordinal: 214550
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner 2026-10-17: "une démo complète de toutes les features de chaque hardware", to exploit each machine to the full, as zinc APIs that programs keep using (each feature exposed through zinc:gfx / zinc:sys / a console plugin, simulated on the desktop). PSP: the analog nub, d-pad, all buttons and the L/R triggers, sound (PocketJS's 44.1/22.05/11.025 kHz rule: the hardware resampler is broken), the 480x272 screen at 60 fps, battery and clock, Wi-Fi status; no vibration and no second stick exist on a PSP (say so on screen). PS Vita: both sticks, front touch (multitouch) and the rear touch pad, the gyroscope and accelerometer (motion), L/R, sound, the 960x544 OLED/LCD, cameras if the emulator gives them; vibration only on PS TV with a DualShock 3 (say so). PS2: both DualShock 2 sticks, pressure-sensitive buttons, vibration (both motors), sound (SPU2 voices), the memory card (save and load), 640x448. Nintendo 3DS: both screens (400x240 top, 320x240 bottom touch), stereoscopic 3D on the top screen following the 3D slider (left/right eye renders), the circle pad (and C-stick / ZL / ZR on the New 3DS), gyroscope and accelerometer, the microphone level, sound (ndsp, with the CSND fallback when the DSP firmware is missing), Wi-Fi status. Each demo is one screen per feature with live readouts and a small interactive toy per input, built with the Kenney assets the other demos use, and runs in the owner's emulators (PPSSPP, Vita3K, PCSX2, Azahar: map each feature to the emulator's input and note what an emulator cannot give), with a video per console. Lessons: docs/reports/games/pocket3d-hardware-adaptation.md, docs/targets/handhelds.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/hardware-<console> for psp, vita, ps2 and n3ds: every feature listed above shown live (or a clear line where the hardware or the emulator lacks it), copied to ~/Documents/<console>/ for the owner
- [ ] #2 the new inputs and outputs (rear touch, motion, pressure buttons, vibration, second screen, stereo 3D, microphone level, memory card) are zinc APIs with a desktop simulation and a T0 test each
- [ ] #3 a video or screenshot series per console in docs/reports/zinc-next-consoles.md
<!-- AC:END -->
