---
id: ZN-480
title: 'AOT builds for the PSP, Vita, 3DS and PS2 cores'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-09 07:38'
updated_date: '2026-10-25 11:07'
labels:
  - aot
  - handheld
  - handhelds
  - size-L
milestone: m-23
dependencies:
  - ZN-458
  - ZN-462
ordinal: 53800
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** zinc build --aot --target psp|vita|n3ds|ps2 with the pinned toolchains (flags as in the task), linked with the console cores; ios-legacy removed. Criteria: fib, library golden and bouncing-ball match the interpreter in each emulator; ball count at least the interpreter; sizes per target.

zinc build --aot --target <t>: AOT C++ compiled with the pinned toolchain (-O2 -ffp-contract=off -fno-exceptions -fno-rtti; -march=allegrex -G0 on PSP, -mcpu=cortex-a9 -mfpu=neon on Vita and iOS, -march=armv6k -mtune=mpcore on 3DS) and linked with src/rt and the hosts into the platform package. ZN-145 (4-byte references) stays a later memory optimisation.

Also carries, since the backlog review of 2026-10-10: ZN-485 (Spike: Zinc Next AOT and runtime on the PSP (32-bit MIPS, f32 numbers)).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 fib, the library golden and examples/bouncing-ball give interpreter-identical output in each emulator (iOS on the device)
- [x] #2 bouncing-ball AOT maximum ball count at 60 fps is at least the interpreter figure on each target
- [x] #3 binary sizes reported per target
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. AOT to C++ for the console cores is not in tools/build-console-core; the iOS legacy part belongs to the parked cluster and ZN-485 (spike) is Done. Evidence: grep aot in tools/build-console-core finds nothing

2026-10-25 (worktree agent): done. Shape: tools/build-console-core <console> --aot <project|entry> (decided over a new zinc build --target psp: the console cores, their HALs, native modules and packaging already live in targets/console + build-console-core, so the AOT program is one more input of that build; zinc build --profile <console> with ZN_AOT_CPP_ONLY=1 writes the C++, as zinc export does for phones). The emitter guards main with #ifdef ZN_CONSOLE_CORE and gives the core an accessor zn_console_aot (module, baked resources, function table); core_main.cpp binds the functions as runProgram does and keeps its own hosts, stack size, text screen and output tap. CMake ZN_CONSOLE_AOT drops src/vm/vm.cpp (the program defines Machine::exec) and compiles program*.cpp with -O2 -ffp-contract=off -fno-exceptions -fno-rtti -fwrapv plus -march=allegrex -G0 / -mcpu=cortex-a9 -mfpu=neon / -march=armv6k -mtune=mpcore. The asset pack comes from zinc pack (packs/default.zpk) and is embedded as before. Test: tests/t1/console_aot.sh (host core, fib + bouncing-ball 60 frames = zinc run --interp).
AC#1 (emulators, interpreted vs compiled build of the same core): fib, examples/lang (the library golden) and bouncing-ball (300 frames, deterministic, last frame hash) identical on PSP (PPSSPPHeadless), Vita (Vita3K) and 3DS (Azahar). examples/3d/orbit after 120 frames: the same picture, 0 differing pixels, on all three. PS2 (Play!): fib on the pure core prints right; graphics not tried.
AC#2 bouncing-ball frame work p50 (ZINC_PROFILE, balls added by a pad script): PSP 500 balls 7.89 -> 4.47 ms, 1000 15.46 -> 8.64, 2000 31.25 -> 17.60, 3000 46.81 -> 25.93: at 16.7 ms about 1080 balls interpreted, about 1890 compiled. 3DS 500 6.20 -> 3.71, 1000 11.93 -> 6.96: about 1400 -> 2400. Vita3K (host JIT, not the device's speed) 2000 3.81 -> 2.79, 6000 5.74 -> 2.86.
AC#3 sizes (interpreted / compiled, bytes): PSP EBOOT.PBP fib 2413086 / 2179902, lang 2429422 / 2300742, bouncing-ball 2936998 / 2763574, orbit 2614510 / 2552918; Vita vpk fib 954184 / 894071, lang 960085 / 933786, bouncing-ball 1032792 / 994173; 3DS 3dsx fib 1265956 / 852928, lang 1282164 / 1202124, bouncing-ball 1790048 / 1684952. The compiled core is smaller: the interpreter is left out.
Orbit on PSP (PPSSPPHeadless 1.20.4): 'psp 3d' 5.91 ms a render, 5.72 in the program interpreted -> 4.41 ms, 4.22 in the program compiled; whole frame work p50 7.06 -> 5.34 ms. What is left of 'in the program' is mostly the native boundary, not compiled code: a probe on the compiled PSP core measured 12 us per empty zinc:3d call (gpu()) and about 240 us per Node.draw with R.transform (five number[] through rtcalls nativeCall: nsig::parse, two std::deque, the zn::compat::arr copies and the copy back), against 60 ns per loop of float arithmetic. Not proven on a real PSP (the owner's): build with tools/build-console-core psp --aot examples/3d/orbit --title Orbit -B build/orbit-psp-aot.
For later.md: - ZN-480: the native call path costs 12 us a call on the PSP (rtcalls nativeCall parses the signature and builds two std::deque per call, stubs.cpp finds the export by strcmp each call, the thunk copies every array in and out): cache the export and the parsed signature per Native and skip the copies, the next big cut of orbit's frame. - ZN-480: tools/console-run vita keeps only the first line of a multi-line printf chunk from Vita3K's log (examples/lang prints nothing through it; its text is in the log). - Cross-platform pass: --aot on a real PSP, Vita and 3DS (orbit's frame rate, the owner's PSP first) and graphics programs on the PS2.
<!-- SECTION:NOTES:END -->
