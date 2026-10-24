---
id: ZN-458
title: 'zinc run/export --target psp|vita|n3ds|ps2 --emu: prebuilt console cores, no SDK needed'
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
ordinal: 50100
updated_date: '2026-10-25 01:53'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-10-25):** Wrap tools/build-console-core and tools/console-run into zinc export/run --target <console> [--emu] using a prebuilt core per console published like the ESP32 image (backlog/later.md ZN-457 line); program.zbc appended, EBOOT/VPK/3dsx written without the SDK. Criteria: export works on a machine without the SDK for the four consoles; run --emu prints hello; T2 console_emulators stays the proof. Carries ZN-459 and ZN-460. Already there: targets/psp/hal_psp.cpp; targets/console/psp.cmake; tools/build-console-core; tools/console-run; tests/t2/console_emulators.sh; commit 99ab5db2.

targets/psp/hal_psp.cpp: exit callback (HOME), scePowerSetClockFrequency(333,333,166), sceKernelGetSystemTimeWide clock, sceCtrl buttons, sceDisplay + sceGu init with 16-bit framebuffers, log to stdout. targets/psp: CMake with the pspdev toolchain building the core PRX into EBOOT.PBP with PARAM.SFO (MEMSIZE). zinc export --target psp writes the folder with program.zbc without the SDK; zinc run --target psp --emu uses PPSSPPHeadless.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 examples/hello prints the same output as on macOS through zinc run --target psp --emu (f32 profile)
- [ ] #2 tests/t2/psp_hello.sh passes with the emulator and exits 77 without it
- [ ] #3 zinc export --target psp works on a machine without pspdev (prebuilt core)
- [ ] #4 the EBOOT boots on a PSP-2000+ with custom firmware (manual check noted in the task)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: done-partly. The PSP core boots in PPSSPPHeadless and prints hello; what is missing is the user-facing zinc run/export --target path with a prebuilt core, and the real-PSP check. Evidence: targets/psp/hal_psp.cpp; targets/console/psp.cmake; tools/build-console-core; tools/console-run; tests/t2/console_emulators.sh; commit 99ab5db2
Review 2026-10-25: merged ZN-459 here (Vita: hello in Vita3K). Carry over: Vita hello runs in Vita3K and on the owner's Vita (hardware demo); the rest is the same export/run path as ZN-458. The Vita hello runs through tools/console-run in Vita3K (tests/t2/console_emulators.sh:3,35) and on hardware; what is left (zinc export/run --target <console> without the SDK, the t2 test names) is the same CLI path as ZN-458 (open). Carry over the VPK zip writer criterion.
Review 2026-10-25: merged ZN-460 here (3DS: hello in Azahar). Carry over: 3DS hello runs in Azahar and on hardware (hardware demo, Homebrew Launcher naming); the rest is the same export/run path as ZN-458. Same as ZN-459 for Azahar (console_emulators.sh) and hardware; carry over the RomFS + SMDH export without the SDK and AC2's RetroArch Azahar-core capture into ZN-458.
<!-- SECTION:NOTES:END -->
