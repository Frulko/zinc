---
id: ZN-806
title: >-
  Cross-platform pass: handhelds and old tablets (PSP, Vita, 3DS, PS2, TouchPad,
  Nexus 7)
status: Backlog
assignee: []
created_date: '2026-10-24 23:55'
labels:
  - size-L
  - cross
milestone: m-23
dependencies: []
ordinal: 54100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- music (2026-10-15): check on the TouchPad by hand: the screen off after the delay and the first touch waking it at LED 0 (the open source warns a panel at level 0 may misbehave: write 3 instead), the SSDP search through openPort, UDP 7777 from another machine, a radio and a Spotify playlist started through the speakers (the account number tried 1..4).
- ZN-718: tests/t1/proto_devtools is skipped: lib/std/ui.ts needs `TIER` as i32 in the prototype's zinc:platform (compiler/src/capabilities.ts types every capability as boolean), `gradientPaint` and `overlaid` in sim/gfx.mjs and runtime/gfx.*; give the prototype stubs for them, or retire the test with the prototype.
- ZN-753: breakout gets Kenney's Interface Sounds once the console cores have audio (PSP pinned to 44.1/22.05/11.025 kHz; 3DS ndsp needs the DSP firmware, else CSND).
- ZN-759: show the Vita camera picture; the hardware demo only says whether the cameras open.
- ZN-759: PS2 memory-card saves have no `icon.sys`.
- ZN-468: on a real PSP, measure the GE replay (bouncing-ball's ball count at 60 fps, CPU per frame) and try its upgrades: swizzled T8/8888 textures, a 5650 framebuffer with dither, building the next display list while the GE draws (one sceGuSync a frame now). PPSSPP's timings are not the hardware's.
- ZN-469: on a real Old and New 3DS, measure the citro3d replay (ball count at 60 fps) and look at the stereo pair and the bottom screen drawn on the GPU (both eyes change at one vblank; filtered sprite edges match the raster in Azahar). Azahar's timings are not the hardware's.
- ZN-774.13: music-tree on the HP TouchPad and the Nexus 7 with `zinc:stage` (taps, drags, scrolling, idle frames, frame cost with `tools/zbench`).
- webOS strip (docs/reports/hardware/webos-fullscreen-intermittent.md): log the raw SDL y of a touch with ZINC_WEBOS_TOP=0 (86 at row 100
- zinc:gl (libzn_webgl) is not in the armv7-webos build: a real fragment shader on the TouchPad needs the GLES2 display to expose a shader pass (Musique's lava lamp computes its field on the CPU at 96x72 meanwhile).
- ZN-754: marble's low variant (vertex colours, 4,216 triangles) checked by eye on the PSP, PS2 and 3DS.
- ZN-457: Linux CI for the console runners (PPSSPPHeadless on Linux, Vita3K and Azahar AppImages under Xvfb, Play! for the PS2 without BIOS); zig c++ and Linux builds of targets/console and the new HALs.
- ZN-754: run Meadow Run and Marble Terraces in PPSSPP, Vita3K, PCSX2 and Azahar; per-console frame times; the platformer atlas in CLUT8 on PSP/PS2.
- ZN-753: run the four breakout builds on real PSP, Vita, PS2 and 3DS hardware.
- ZN-758: examples/music imports zinc:link (plugin.json: macos, linux, android); it builds for armv7-webos (checked 2026-10-17) but discovery and pairing on the TouchPad are not run.
- ZN-759: on the owner's four consoles: PS2 and PS TV vibration, pressure, Vita rear touch, the motion axis signs (guessed from the SDK docs on Vita and 3DS), the microphone scale, the battery percent, the 3DS ndsp path with a real `dspfirm.cdc`; the platformer on PSP runs at 30 fps in PPSSPP (work 11.8 ms).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 PSP, Vita, 3DS, PS2 on hardware or emulators: breakout/Meadow Run/Marble frame times, GE and citro3d replay measures, input and sensors
- [ ] #2 TouchPad/Nexus 7: screen-off, SSDP, zinc:stage music-tree, webOS strip, zinc:link pairing
- [ ] #3 Linux CI for the console runners
<!-- AC:END -->
