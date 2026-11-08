---
id: ZN-1061
title: 'Real PSP, Vita and 3DS measurements'
status: Backlog
assignee: []
created_date: '2026-11-07 16:41'
labels:
  - psp
  - vita
  - 3ds
  - cross
  - size-M
  - parked
milestone: m-23
dependencies: []
ordinal: 102500
updated_date: '2026-11-07 18:30'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Measurements and checks that emulators cannot prove.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-649.12: rebuild graphics console cores with Physics2D, verify the Box2D pinball on the physical 3DS/other consoles and Pi, and measure frame time/memory; the registration and packed invariants pass only on the Mac so far.
- ZN-477: run examples/3d/orbit, cubes and gl-check on the owner's Vita with the GXM core (watch SDL's texture fragment program paired with the psp2spvc vertex program, the transposed Wvp), and log the ms in zinc-next-perf.md.
- ZN-476/ZN-478: run examples/3d/orbit on a real PSP (Adrenaline) and 3DS, Old and New, with the slider up; log the ms.
- ZN-790: play n3ds-pinball, n3ds-platformer and n3ds-starfall on a real 3DS (stereo depth comfort, stylus, frame time).
- ZN-791: Paint Arena on a real PSP, Vita and 3DS on real Wi-Fi (PSP WPA limits, routers that block client broadcasts).
- ZN-480: --aot on a real PSP, Vita and 3DS (orbit's frame rate, the owner's PSP first) and graphics programs on the PS2.
- tokyo: measure the native World on the real PSP, 3DS and Vita.
- tokyo PSP: measure on a real PSP-2000 the GE time of 38,900 triangles and 1,451 draws (Pocket estimates ~26 ms) and the 30.3 MB heap (too much for a PSP-1000).
- tokyo 3DS: time the frame on the real Old 3DS XL (Azahar does not time the PICA200); if it misses 30 fps, lower the n3ds budget in devices.ts from 60,000 toward Pocket's 40,000.
- tokyo 3DS: if ETC1 blocks show on the windows on hardware, make the facades RGB565 as Pocket does.
- zinc:3d: run `zinc3d_world_build`'s world with `--profile psp`, n3ds and vita on the real consoles.
- tokyo: stereo on the 3DS is unproven (Azahar runs with the slider at 0): check the right-eye shot on hardware, measure the second render (~0.6 ms), tune `STEREO_SPREAD` (1.5 m).
- tokyo: run the PSP and Vita overlay panel with `ZINC_TOKYO_TAP` in PPSSPP and Vita3K, and the pad navigation on a real pad.
- tokyo PSP: time the GE with CLUT8 swizzled pictures and shadows on a real PSP (PPSSPP does not time the GE).
- tokyo 3DS: measure the SD read time and the memory peak of near streaming on the real Old 3DS.
- zinc:3d: re-measure select-bench on a quiet Mac and on a real PSP.
- tokyo PSP-1000: the 17,000 KB heap fit in PPSSPP only (peak 15.8 of 16.6 MiB); try a real PSP-1000 and time the stick's reads on hardware.
- tokyo 3DS: linked-pack read-ahead costs 36-47 ms an entry on core 1 at an 80% limit in Azahar; measure on a real Old 3DS, where core 1 is shared with the system.
- tokyo Vita: Vita3K follows the Mac's load (p95 12-23 ms); remeasure on a quiet Mac or a real Vita.
- tokyo 3DS: on the real Old 3DS XL read the `n3ds:` and `sd packs` lines of sdmc:/zinc.log; the heap margin is about 4 MB (34.2 of 38), lower the 16 MB zrt heap if Tokyo uses much less.
- tokyo 3DS: confirm on the real Old 3DS that the white ground blocks are gone (ZINC_PROFILE=1 counters `draws without their picture`, `chunk loads held back`); Azahar never showed them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 3D orbit, cubes and gl-check on the owner Vita, PSP and 3DS with timings in zinc-next-perf.md
- [ ] #2 Tokyo and zinc:3d World on real consoles: GE time, heap, SD reads, stereo, ETC1 facades
- [ ] #3 n3ds demos, Paint Arena and the device player on real hardware; --aot on real consoles
- [ ] #4 Box2D pinball on a physical 3DS
<!-- AC:END -->
