---
id: ZN-759
title: 'A hardware showcase demo per console: every feature of PSP, Vita, PS2 and 3DS'
status: In Progress
assignee:
  - '@parallel'
created_date: '2026-10-17 09:39'
updated_date: '2026-10-17 11:37'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Session 1 (worktree agent, 2026-10-17). Shared APIs (commit feat(console): hardware APIs...):
- Decision (to record): console hardware features are queries of zinc:sys device() (the D122 pattern), answered by the console HAL's hal_device() on a console core (weak in targets/console/host_console.cpp), by a simulated device on a desktop (zinc run --simulate psp|vita|ps2|n3ds, devices/<console>.json, app/devicesim panel: microphone level, 3D slider, rear pad), else the desktop's own answer. New queries: reartouch, microphone, stereo (arg 1/0 asks for a picture per eye), eye, storage. A std module zinc:hardware (lib/std/hardware.ts) wraps them: battery, network, accelerometer, gyroscope, rearTouches/hasRearTouch, microphoneLevel, stereoDepth/setStereo/stereoEye, vibrate, saveLocation.
- Decision: the pad's own features stay zinc:gfx gamepad rows (D101): a console's pad is gamepad 0 (W3C order, both sticks), pressure is gamepadButtonValue through a new HalGamepad.value[17] (0 = no pressure: the bit counts), the motors gamepadRumble (low = big motor, high = small). Second screen = zinc:gfx openWindow (the 3DS HAL maps window 1 to the bottom screen). Memory card = zinc:storage (saveLocation names the file).
- Decision: zinc:audio on consoles = a small mixer linked into the core as the native module 'Audio' (targets/console/audio_console.cpp), same exports and signatures as plugins/audio; mixed on the program's thread at frame end into a ring (console_audio.h) that the HAL's audio thread drains. miniaudio rejected: its engine needs atomics that the PSP's and PS2's MIPS cores lack, no backends for these consoles. WAV (PCM 8/16) only on consoles. Rates: PSP 44100 (Pocket3D's rule: the hardware resampler is broken), Vita 48000, PS2 48000, 3DS 22050.
- Fix: check.cpp arrayConversion did not declare the element alias of a down conversion (f64[] to f32[]): zinc:audio failed to compile for the psp/ps2 profiles ('__T7'); regression in tests/t0/console_audio.sh.
- Tests (T0, all pass): hardware_motion, hardware_reartouch, hardware_microphone, hardware_stereo, hardware_vibration (rumble recorded in ZINC_DEVICE_LOG headless), hardware_pressure, hardware_screen2, hardware_memcard (console core), console_audio (console core). console_core and console_host still pass. host and webenv_gamepad print the main checkout's plugin.json warnings (unknown key web: the worktree lies inside the main repo, whose plugins/ the module loader also reads): environmental, not this change.

PSP done (commit feat(psp): ...): examples/hardware-psp (Buttons, Analog nub, Sound, Screen, System), shared screens in examples/hardware-kit (kit.ts, pages.ts). Live in PPSSPPHeadless: all buttons as gamepad 0, the nub as the left stick, zinc:audio at 44100 Hz (sceAudio channel, ring filled at frame end; backend 'sceAudio'), 480x272 at 59.9 fps with 40 sprites (ZINC_PROFILE: work p50 2.82 ms, present p50 11.23 ms, emulated 333 MHz), battery/mains (PPSSPP: 100 %, ac), Wi-Fi switch (sceWlanGetSwitchState), UTC clock, zinc:storage counter kept across runs. Marked missing on screen: vibration, second stick, touch, motion, microphone. Copied to ~/Documents/psp/hardware/EBOOT.PBP (tools/console-demos ../examples/hardware-psp hardware --title 'Zinc PSP Hardware' psp). Shots: docs/img/consoles/psp-hardware.png. Fonts: zinc pack bakes only the sizes its font() calls name literally, so the kit names one literal set per screen scale.

3DS done (commit feat(n3ds): ...): examples/hardware-n3ds (Buttons, Circle pad, Touch screen, 3D screen, Motion, Microphone, Sound, Screen, System; the bottom screen = openWindow with page tabs and a drawing pad). HAL: gamepad 0 (positional W3C: B south, A east; ZL/ZR triggers; circle pad and C-stick via ir:rst on a New 3DS), hal_win_* (first window = bottom screen, stylus = its pointer), stereo (setStereo + slider: frames alternate GFX_LEFT/GFX_RIGHT, swap after the right; parity kept), HID accelerometer/gyro, MIC level, ptm/mcu battery, ac Wi-Fi + SSID, zinc:audio at 22050 Hz via ndsp or CSND fallback (zn_console_audio_backend names it). Azahar: live buttons, sticks, bottom screen, motion (gravity z), battery, Wi-Fi; CSND (no dspfirm.cdc on its SD); microphone silent (its input off) and slider at 0 (its setting): both said on screen; the stereo pair proven with --env ZINC_3D_SLIDER=0.8 and the HAL's right-eye shot. Screen page 30 sprites: work p50 2.43 ms, present p50 5.85 ms (Azahar). Copied to ~/Documents/3ds/hardware.3dsx. Shots: docs/img/consoles/n3ds-hardware.png, n3ds-hardware-bottom.png.
<!-- SECTION:NOTES:END -->
