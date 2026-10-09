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
ordinal: 300070
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
targets/n3ds/hal_n3ds.cpp: gfxInitDefault, aptMainLoop each frame (quit), osSetSpeedupEnable on New 3DS, hid buttons, svcOutputDebugString log, romfsInit. next/targets/n3ds: Makefile or CMake with devkitARM producing the core .3dsx; zinc export --target n3ds appends a RomFS holding program.zbc and writes the SMDH without the SDK.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/hello output appears in the Azahar log (Debug.Emulated) through zinc run --target n3ds --emu
- [ ] #2 the same .3dsx runs under RetroArch with the Azahar core and the output is captured
- [ ] #3 tests/t2/n3ds_hello.sh passes or exits 77 when the emulator is missing
- [ ] #4 runs on hardware through 3dslink (manual check noted)
<!-- AC:END -->
