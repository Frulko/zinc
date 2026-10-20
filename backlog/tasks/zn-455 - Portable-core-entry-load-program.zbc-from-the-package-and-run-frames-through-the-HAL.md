---
id: ZN-455
title: >-
  Portable core entry: load program.zbc from the package and run frames through
  the HAL
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-09 07:37'
updated_date: '2026-10-17 10:18'
labels:
  - handheld
  - handhelds
  - host
  - size-M
milestone: m-23
dependencies:
  - ZN-454
ordinal: 217000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
next/targets/console/core_main.cpp: read program.zbc from a path or an embedded blob, zbc::decode and verify, install the console host and the graphics host, run through hal_run with zinc:start and zinc:exit markers on the HAL log (same contract as the ps1 runner), map the exit status. Compiled by every handheld target and, for tests, on macOS with the headless HAL.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 on macOS with the headless HAL, examples/hello and examples/bouncing-ball (ZINC_FRAMES=60) run from a .zbc file with output identical to zinc run
- [x] #2 an invalid or truncated program.zbc reports a clear error and exits non-zero (T0)
- [x] #3 core code size for macOS arm64 reported in the task notes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-17 (worktree agent, handheld chain). Done.

What was done: next/targets/console/core_main.cpp reads program.zbc (an argument ending in .zbc, else the file beside the executable, else the data directory; or the bytes linked in with -DZN_CONSOLE_EMBED=program.zbc [-DZN_CONSOLE_EMBED_RES=resources.bin], embed.cmake, for a console whose emulator gives no file system), decodes and verifies it, installs resources.bin when it is beside it, the graphics host (installGfx, whose installSys is the console host) and runs the interpreter; output framed on the HAL log by `zinc:start` and `zinc:exit <status>` (the PS1/ESP32 contract plus the status); 2 for a missing or invalid program. The graphics host is linked as in next/CMakeLists.txt (gfx_host.cpp, resources.cpp, runtime zrt/host/raster/ttf/gfx with the runtime's flags); gfx_stubs.cpp answers what the core does without (UI log, system signals, asset packs, image decoding from bytes, the stb PNG encoder: the runtime writes its own stored PNG). With a console HAL (-DZN_CONSOLE_HAL=...) zn_hal_is_live is 1: the program runs until it ends, no 60-frame headless budget. A console export is `zinc pack [--profile psp] <project> -o app.zapp` then `tar -xf app.zapp program.zbc resources.bin` beside the core (the .zapp is a ustar).
Proof: tests/run --only console_core PASS (T0, tests/t0/console_core.sh): with the headless HAL, examples/hello and examples/bouncing-ball (ZINC_FRAMES=60) packed by zinc pack print exactly what `zinc run --interp` prints, the last frame hash included (bouncing-ball: framehash 60 320x240 216f7766b51df966 on both); a missing file ("cannot read"), a non-bytecode file and a truncated program.zbc each get a "zinc: <path>: ..." message and exit 2 after zinc:exit 2. tests/run --only console_host PASS.
Core code size, macOS arm64 (Apple clang 21, -O3, headless HAL): zinc-core 843 KB file, __TEXT segment 640 KiB (__text 524 KiB); the pure core without the graphics host (ZN-454) 400 KiB of __TEXT. resources.bin of bouncing-ball: 508 KB (the baked fonts).
<!-- SECTION:NOTES:END -->
