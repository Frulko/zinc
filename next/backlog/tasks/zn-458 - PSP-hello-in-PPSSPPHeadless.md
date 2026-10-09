---
id: ZN-458
title: 'PSP: hello in PPSSPPHeadless'
status: Backlog
assignee: []
created_date: '2026-10-09 07:37'
labels:
  - handheld
  - handhelds
  - psp
  - size-M
milestone: m-23
dependencies:
  - ZN-455
  - ZN-456
  - ZN-457
ordinal: 300050
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
targets/psp/hal_psp.cpp: exit callback (HOME), scePowerSetClockFrequency(333,333,166), sceKernelGetSystemTimeWide clock, sceCtrl buttons, sceDisplay + sceGu init with 16-bit framebuffers, log to stdout. next/targets/psp: CMake with the pspdev toolchain building the core PRX into EBOOT.PBP with PARAM.SFO (MEMSIZE). zinc export --target psp writes the folder with program.zbc without the SDK; zinc run --target psp --emu uses PPSSPPHeadless.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/hello prints the same output as on macOS through zinc run --target psp --emu (f32 profile)
- [ ] #2 tests/t2/psp_hello.sh passes with the emulator and exits 77 without it
- [ ] #3 zinc export --target psp works on a machine without pspdev (prebuilt core)
- [ ] #4 the EBOOT boots on a PSP-2000+ with custom firmware (manual check noted in the task)
<!-- AC:END -->
