---
id: ZN-460
title: '3DS: hello in Azahar'
status: Backlog
assignee: []
created_date: '2026-10-09 07:37'
labels:
  - 3ds
  - handheld
  - handhelds
  - size-M
milestone: m-23
dependencies:
  - ZN-455
  - ZN-456
  - ZN-457
ordinal: 214570
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
targets/n3ds/hal_n3ds.cpp: gfxInitDefault, aptMainLoop each frame (quit), osSetSpeedupEnable on New 3DS, hid buttons, svcOutputDebugString log, romfsInit. targets/n3ds: Makefile or CMake with devkitARM producing the core .3dsx; zinc export --target n3ds appends a RomFS holding program.zbc and writes the SMDH without the SDK.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/hello output appears in the Azahar log (Debug.Emulated) through zinc run --target n3ds --emu
- [ ] #2 the same .3dsx runs under RetroArch with the Azahar core and the output is captured
- [ ] #3 tests/t2/n3ds_hello.sh passes or exits 77 when the emulator is missing
- [ ] #4 runs on hardware through 3dslink (manual check noted)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: merged into ZN-458. 3DS hello runs in Azahar and on hardware (hardware demo, Homebrew Launcher naming); the rest is the same export/run path as ZN-458. Evidence: targets/n3ds/hal_n3ds.cpp; commit 18e75749, 358c008b Verifier: Same as ZN-459 for Azahar (console_emulators.sh) and hardware; carry over the RomFS + SMDH export without the SDK and AC2's RetroArch Azahar-core capture into ZN-458.
<!-- SECTION:NOTES:END -->
