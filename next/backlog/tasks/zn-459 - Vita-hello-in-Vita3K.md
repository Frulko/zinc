---
id: ZN-459
title: 'Vita: hello in Vita3K'
status: Backlog
assignee: []
created_date: '2026-10-09 07:37'
labels:
  - handheld
  - handhelds
  - vita
  - size-M
milestone: m-23
dependencies:
  - ZN-455
  - ZN-456
  - ZN-457
ordinal: 300060
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
targets/vita/hal_vita.cpp: scePowerSetArmClockFrequency(444) and GPU 222, CDRAM framebuffers through sceDisplaySetFrameBuf, sceCtrl, sceClibPrintf log, _newlib_heap_size_user. next/targets/vita: CMake with VitaSDK (vita_create_self, vita_create_vpk). zinc export --target vita writes the VPK with its own zip writer (prebuilt eboot.bin and param.sfo plus program.zbc).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/hello output appears in the Vita3K log through zinc run --target vita --emu
- [ ] #2 tests/t2/vita_hello.sh passes with Vita3K and firmware installed, else exits 77
- [ ] #3 zinc export --target vita works without VitaSDK
- [ ] #4 the VPK installs and runs on a HENkaku/Enso Vita (manual check noted)
<!-- AC:END -->
