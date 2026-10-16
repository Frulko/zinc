---
id: ZN-620
title: 'App entry without the CLI: static engine library for embedders'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 14:03'
updated_date: '2026-10-16 12:50'
labels:
  - mobile
  - size-M
milestone: m-26
dependencies: []
ordinal: 194000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A library target with one entry (`zn_app_main`): AOT program or bundled `.zapp`, runtime, host, plugins registered statically; no `src/tc`, no `src/frontend`, no `dlopen`, no `fork` (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 on macOS, hello and `examples/rn-showcase` linked against it print and draw what `zinc run` does (existing goldens)
- [x] #2 `nm` shows no `dlopen`, `fork` or `execv` reference
- [x] #3 a T0 test
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-16 in a worktree (Android chain). The embedder contract follows the coordinator's decision (SDL3 main-callbacks shape) and docs/reports/zinc-next-mobile-core.md §3.

What exists:
- include/zn/app.h: zn_app_init / zn_app_iterate / zn_app_event / zn_app_quit / zn_app_main (C ABI).
- src/app/app.cpp (in the CMake target zn_app): runProgramApp loads the module, runs the top level and keeps the Machine; iterate calls the prelude's __appStep by name; finish does what runModuleHooked + report do (status 0/1/101/4 as zinc run).
- src/app/shell_sdl.cpp: SDL_AppInit/Iterate/Event/Quit (SDL_MAIN_USE_CALLBACKS) calling the contract 1:1; stops iterating while in the background; on Android also logcat (stdout/stderr through a pipe, tag "zinc"), HOME/ZINC_HOME/TMPDIR/cwd in the app's files and cache dirs, APK assets copied once per stamp, the heap (ZINC_HEAP).
- Prelude (src/frontend/modules.cpp), split not forked: __gfxStep (one frame) + __gfxLoop (a loop over it) + __gfxAppStep (one frame per tick, ZINC_FRAMES counted, gfxFinish at the end); __loopStep (one turn) + __runLoop (a loop over it) + __appStep (the frame step if any, else a turn). App mode is bit 1 of host.loopReal (bit 0 stays "real clock"): no new runtime row. In app mode __runLoop returns; a real-clock turn whose timer is not due returns instead of sleeping.
- __appStep is a root of removeUnreachable (kAppStepFunction, include/zn/limits.h), else it is inlined away (one call site).
- CMake: zn_app (src/app/app.cpp + its own copies of src/rt/*.cpp and src/zbc/zbc.cpp: no zn_zbc/zn_ir/zn_frontend dependency) and zn_app_host (the zn_host_gfx sources + hal_sdl.cpp compiled with ZN_APP_LIBRARY); build/zn_app.link lists the archives for a link outside CMake. ZN_APP_LIBRARY: loop.cpp starts no child process (spawn, spawnProcess return -1, "child processes are not available in an app"), sys_host.cpp's IOKit/CoreFoundation dlopens off, gfx_host.cpp's 125 fps sleep off, loop::wait never sleeps.
- AOT (src/aot/aot.cpp): under -DZN_APP_LIBRARY the generated main is zn_app_init and calls runProgramApp; the no-host variant is `int main(int, char**)` (golden aot/fib.cpp updated).
- `ZN_AOT_CPP_ONLY=1 zinc build` keeps out.cpp (+ out.partN.cpp), writes out.libs (the plugins' archives) and links nothing: what zinc export --target android uses.
- hal_sdl.cpp: the zn_hal_sdl_event queue (256 events, a mutex: lifecycle events come from Android's UI thread), read before SDL_PollEvent.

Criteria (tests/t0/app_library.sh, 20 s): AC1 hello through zn_app_main prints the bytes and exit status of `zinc run ../examples/hello`; rn-showcase through shell_sdl.cpp (SDL callbacks) gives frame hash 3f8638f736da921a (discover light, tests/golden/rn-showcase/hashes.txt); plus a real-clock timers/promises program through the callbacks shell prints "top then 1 tick 1 tick 2 tick 3 late". AC2 nm -u of libzn_app.a and libzn_app_host.a: no dlopen, fork, vfork, execv*, posix_spawn* (libuv's process.c and SDL's loader stay in their own archives; with -dead_strip nothing reaches uv_spawn). AC3 the test. Also run: aot (golden regenerated), T1 conformance, rn_showcase, splash: pass. T0 tier: the failures are unit binaries not built in this tree, and lexer ui.tsx, which fails with main's binary too (fbd0a3f4 changed tests/conformance/ui.tsx, not its .tok).

Decision text for the coordinator (embedder contract, ZN-620): one C ABI in the SDL3 main-callbacks shape for every shell (desktop test, Android now, iOS later): zn_app_init runs the top level up to the loop, zn_app_iterate is the vsync tick (a frame of __gfxStep or a turn of __loopStep), zn_app_event queues SDL events for the window HAL, zn_app_quit ends the run, zn_app_main = init + iterate until done (desktop behaviour and goldens unchanged). App mode reaches the prelude as bit 1 of host.loopReal; the step is found by name (kAppStepFunction, a root of the dead-function pass). The library has its own copies of rt and of the host compiled with ZN_APP_LIBRARY instead of reusing zn_rt (which pulls zn_zbc -> zn_ir -> zn_frontend through CMake) and zn_host_gfx (process spawning, dlopen of macOS frameworks). Revisit when a second consumer needs rt without the compiler: then move zbc.cpp into an archive of its own.

Lines for later.md:
- ZN-620: zn_app runs AOT programs only; a bundled .zapp (interpreter + ZBC, the player of mobile-core §6) needs zn_vm in zn_app and the zapp reader moved out of zn_tc (src/zapp.cpp).
- ZN-620: zn_app_quit while the program runs skips __host_gfxFinish (no last-frame capture, no profile summary): call a prelude __appEnd by name as __appStep is.
- ZN-620: an app build on macOS/iOS has no wake lock and battery (sys_host.cpp dlopened IOKit): link IOKit directly where an app needs them.
<!-- SECTION:NOTES:END -->
