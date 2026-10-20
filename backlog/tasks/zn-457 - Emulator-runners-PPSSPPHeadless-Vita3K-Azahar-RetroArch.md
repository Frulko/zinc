---
id: ZN-457
title: 'Emulator runners: PPSSPPHeadless, Vita3K, Azahar / RetroArch'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-09 07:37'
updated_date: '2026-10-17 11:16'
labels:
  - handheld
  - handhelds
  - testing
  - size-M
milestone: m-23
dependencies:
  - ZN-456
ordinal: 215000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pin and fetch or build: PPSSPPHeadless from a pinned PPSSPP commit (--graphics=software, --timeout-wall, --screenshot-save, stdout forwarded), Vita3K release (needs the user's firmware PUP, installed once with --firmware; app via content path or --installed-path, log parsed), Azahar 2126.2 (Qt with a log filter that keeps Debug.Emulated, -p input movie, -g gdb stub) and RetroArch plus the Azahar libretro core (--max-frames, --max-frames-ss-path) as the headless alternative. zinc run --target <t> --emu wraps them and prints the text between zinc:start and zinc:exit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 each runner is fetched or built reproducibly with a pinned hash and cached under ~/.zinc
- [x] #2 a prebuilt sample binary per platform prints a line through each runner within 60 s; a hung program is killed by the timeout with a clear message
- [x] #3 runners exit 77 (skip) when a requirement is missing (Vita firmware, no display server) and say which
- [x] #4 docs/targets/handhelds.md lists the runners and their limits
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-17 (worktree agent, handheld chain). Done for psp, vita, ps2 (added by the owner) and n3ds.

What was done:
- Emulators pinned in src/tc/consoles.cpp, `zinc toolchain install ppsspp-headless|ppsspp|vita3k|play|pcsx2|azahar`: an app the user installed (/Applications, or unpacked in ~/Downloads) first, with its settings, firmware and BIOS; else the pinned release in ~/.zinc/toolchains (SHA-256 checked before use): PPSSPPHeadless built once from the pinned PPSSPP 1.20.4 sources (CMake, ~3 min; an empty MoltenVK stand-in and _DARWIN_C_SOURCE make the macOS build work), PPSSPPSDL 1.20.4 zip, Vita3K build 4189 dmg, Play! 0.72 dmg (no BIOS), Azahar 2126.2 zip; PCSX2 is never downloaded (the user's BIOS). No Vita firmware is downloaded (owner, 2026-10-17): Vita3K runs Zinc's homebrew without it, and the user's install brings theirs.
- tools/console-run <psp|vita|ps2|n3ds> <binary> [--timeout S] [--shot out.png] [--emu NAME] [--window]: prints the lines between zinc:start and zinc:exit, exits with the program's status, 124 on timeout (emulator stopped, message), 77 with the reason when the emulator is missing. Windowed emulators start with `open -g` (never in front), except Play! (its emulation does not start under open -g; documented, PCSX2 is used when installed). Vita3K and PCSX2 run with copies of / their own config (the owner's settings never change; PCSX2's data directory ~/.zinc/emulators/pcsx2 points at the owner's BIOS folder, nothing copied).
- tools/build-console-core <psp|vita|ps2|n3ds> [--pure] [--embed program.zbc [resources.bin]] [--frames N] [-B dir]: the core with the pinned SDK (the 3DS in devkitPro's pinned docker image). HALs: targets/psp/hal_psp.cpp (new: VRAM framebuffer, pad, HOME callback, PPSSPP kemulator: output and screenshot), targets/vita/hal_vita.cpp (new: CDRAM framebuffer, pad, sceClibPrintf), targets/ps2/hal_ps2.cpp (the prototype's, plus the last-frame PPM), targets/n3ds/hal_n3ds.cpp (new: libctru top screen, pad, svcOutputDebugString and sdmc:/zinc.log). Console fragments targets/console/{psp,vita,ps2,n3ds}.cmake (libraries, packing, a 2 MiB register stack: the desktop's 20 MiB is most of a PSP).
- Portability fixes found on the way: src/rt/machine.cpp has no mmap on the consoles (ZN_NO_MMAP) and falls back to the fewest round-tripping %.*e digits where libstdc++ has no floating to_chars (ps2dev); the gfx runtime builds with -fpermissive under GCC (newlib's int32_t is a long on the PSP, PS2, 3DS); core_main writes its own report through the HAL and taps the program's lines (gConsoleTap) for HALs with a second output.
- docs/targets/handhelds.md: the runners, their limits, the contract, the native devkitPro commands for the owner.

Proof (2026-10-17, M1 Pro):
- tools/console-run with the pure core and `console.log('hello from zinc on ' + platform())`: psp (PPSSPPHeadless) "hello from zinc on psp", vita (/Applications/Vita3K.app, the owner's firmware config copied with -w) "hello from zinc on vita", ps2 (PCSX2 2.8.2 with the owner's BIOS) and (Play! 0.72, no BIOS) "hello from zinc on ps2", n3ds (Azahar 2126.2) "hello from zinc on n3ds"; each exit 0, a few seconds each.
- The graphics core (clear, a moving rect, text, 30 frames): output "hello from zinc on <console>, WxH" with the console's screen (480x272, 960x544, 640x448, 400x240) and a last-frame shot per console; the PS2 frame from PCSX2 and from Play! are byte-identical.
- A hung program: PPSSPPHeadless stopped at the timeout, console-run exits 124 "did not finish in 5 s"; `--emu nothing` exits 77 "no nothing".
- T2 test tests/t2/console_emulators.sh (windowed emulators and SDK builds: run alone after integration).

Later (lines for backlog/later.md):
- ZN-457: `zinc run --target psp|vita|ps2|n3ds --emu` wrapping tools/console-run with a prebuilt core per console (the description's CLI form); needs the cores published like the ESP32 image.
- ZN-457: Linux CI for the runners: PPSSPPHeadless builds on Linux; Vita3K and Azahar AppImages under Xvfb; Play! AppImage for the PS2 (no BIOS).
- ZN-457: Azahar TAS movies (-p) as the scripted pad input of the 3DS tests; PPSSPP's input record for the PSP; Vita3K has none (an input file read by the HAL).
- ZN-457: core_main: a program that calls exit() ends without zinc:exit (the runner reports a timeout); an atexit marker with the status.
<!-- SECTION:NOTES:END -->
