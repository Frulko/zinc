---
id: ZN-453
title: 'Handheld targets: decision record, target ids, profiles and capabilities'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-09 07:37'
updated_date: '2026-10-17 10:05'
labels:
  - handheld
  - handhelds
  - targets
  - size-S
milestone: m-23
dependencies: []
ordinal: 206000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Record a decision in docs/reports/zinc-next-decisions.md: targets psp, vita, n3ds, ios-legacy live in Zinc Next only (compiler/ untouched); two delivery paths per target, a prebuilt interpreter core plus program.zbc (no SDK for users, like the ESP32 core) and an AOT path (SDK needed); number profiles (psp f32: the Allegrex FPU is single precision); no libuv on the consoles. Add the four rows to next/src/frontend/profile.cpp and targets/capabilities.json (report docs/reports/hardware/handhelds-psp-vita-3ds-iphone4s.md section 6.4). Also record the PocketJS/Pocket3D parity rules (docs/reports/hardware/pocketjs-pocket3d.md): AOT-only versus prebuilt interpreter core on consoles (the two reports differ: decide with numbers), one renderer per GPU over clean-room device kernels (the Pocket3D kernels carry a title-card licence), licence table of reusable sources and data (PLATEAU, OSM ODbL, CC0; no GoldSrc maps, no ROMs), and the iPhone 4S OS policy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 decision entry written with the two delivery paths and the number profiles
- [x] #2 profile rows psp (f32, 480x272, 16 MiB), vita (f64, 960x544, 192 MiB), n3ds (f64, 400x240, 16 MiB), ios-legacy (f64, 480x320 at scale 2, 96 MiB) exist and a T0 test looks them up
- [x] #3 zinc run --profile psp examples/bouncing-ball runs in the host window with f32 numbers
- [x] #4 capabilities.json rows validate against requires in the existing tests
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-10 (ZN-414): the profile rows psp, vita, n3ds exist now in next/src/frontend/profile.cpp with the values of AC#2; the T0 lookup test, capabilities.json rows and the rest are still to do.

2026-10-17 (worktree agent, handheld chain). Done.

Decision text for docs/reports/zinc-next-decisions.md (the coordinator gives it its number):

### Handheld targets: psp, vita, n3ds, ios-legacy (and ps2 on the same core)
Question: how Zinc Next reaches the PSP, PS Vita, 3DS and the iPhone 4S (iOS 9), and the PS2 the owner added on 2026-10-17; the companion reports differ (handhelds-psp-vita-3ds-iphone4s.md: a prebuilt interpreter core as on the ESP32; pocketjs-pocket3d.md: AOT only on consoles).
- Targets live in Zinc Next only (compiler/ untouched). Ids: psp, vita, n3ds, ios-legacy; the prototype's ps2 profile row (f32, 640x448, 16 MiB) is reused for the PS2.
- Two delivery paths per target. (1) Default: a prebuilt core per console (interpreter + src/rt + the graphics host + the console system host + a native HAL on runtime/include/hal.h), built once by maintainers with the pinned SDK (next/targets/console), and `zinc export --target <id>` puts program.zbc and resources.bin beside it (EBOOT folder, VPK, ELF). No SDK for users, as the ESP32 core. (2) AOT (`zinc build --aot --target <id>`, SDK needed) for release builds and speed.
  Scores (fit x3, perf x3, size x2, maint x2, licence x2, port x1, effort x1): core + AOT later 5,3,4,4,5,5,4 = 63; AOT only 3,5,4,3,5,4,2 = 57; QuickJS core 3,1,3,4,5,5,4 = 44. Numbers: the interpreter runs numeric kernels 5.4x to 6.9x faster than QuickJS (docs/reports/zinc-next-perf.md, line 639); PocketJS holds a 60 fps PSP FPS with 2.2 ms of QuickJS per frame (pocketjs-pocket3d.md 2.8), so a 2D game such as breakout fits the interpreter's budget; AOT is 1.1x to 2.9x native on desktop (perf log line 654), the interpreter about 3x. The core wins on fit (no SDK, single-app vision) and effort (one binary per console, reused by every program); AOT stays the speed path for 3D.
- Number profiles: psp f32 (the Allegrex FPU is single precision; doubles are software), ps2 f32 (the EE FPU is single precision), vita f64, n3ds f64 (VFP11 has doubles), ios-legacy f64.
- No libuv on the consoles (no epoll/kqueue; its Darwin clock needs iOS 10): a console system host without it (ZN-454, next/targets/console/host_console.cpp).
- One renderer per GPU over clean-room device kernels: software raster first (the shared runtime/raster.cpp, the prototype's PS2 path), then GE (PSP), GXM (Vita), PICA (3DS), GLES2 (iOS) replays of the command lists. No code of pocket3d/, devices/ or engine/pocket3d/ (Pocket3D License 1.0: a mandatory title card) is copied; MIT PocketJS game code only with attribution and only where it pulls no Pocket3D crate; provenance recorded in each task.
- Data and content: PLATEAU (attribution), OpenStreetMap (ODbL: a compiled area is a derived database), GSI tiles (attribution), Poly Haven and Kenney (CC0); no GoldSrc maps or WADs (Blender + SDHLT or LibreQuake BSP29 instead), no ROMs, no BIOS or firmware in the repository (the Vita3K firmware is Sony's free PSVUPDAT.PUP, downloaded by the user's machine; the PS2 runs in Play!, which needs no BIOS; PCSX2 is not used).
- iPhone 4S OS policy: one armv7 binary with -miphoneos-version-min=6.0 for stock iOS 9.3.6 (developer signing, ideviceinstaller) and for a 6.1.3 jailbreak (ldid); the choice between them stays with the iPhone spike, the binary is the same.
Revisit when: the interpreter misses 60 fps on breakout in PPSSPP at 333 MHz (then AOT becomes the PSP default), or Vita3K cannot run the core.

What was done: profile row ios-legacy (f64, 480x320, 96 MiB) added beside the psp, vita, n3ds rows of ZN-414 (next/src/frontend/profile.cpp); targets/capabilities.json rows psp, vita, n3ds, ios-legacy (report section 6.4: gamepad on the consoles, touch on vita/n3ds/ios-legacy, gpu ge/gxm/pica/gles2, threads off on the PSP, asset profiles per GPU). T0 tests/t0/handheld_profiles.sh: the four profiles give zinc:platform their numbers and heap (psp: 2^24 + 1 prints 16777216, f32), and their rows answer requires (gamepad, touch, threads, gpu=, width>=, height>=).
Proof: tests/run --only handheld_profiles PASS; --only mobile_profiles PASS; --tier t1 --only system_manifest PASS (the new rows have every capability key); --only ui_layout_option PASS. `ZINC_BACKGROUND=1 ZINC_FRAMES=90 zinc run --profile psp examples/bouncing-ball` ran in the window ("bouncing-ball: started with 1 ball", exit 0); `0.1 + 0.2` prints 0.30000001192092896 under --profile psp, 0.30000000000000004 without.
<!-- SECTION:NOTES:END -->
