---
id: ZN-622
title: 'Android: hello and rn-showcase on the emulator'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 14:04'
updated_date: '2026-10-16 14:02'
labels:
  - mobile
  - size-M
milestone: m-26
dependencies:
  - ZN-619
  - ZN-621
ordinal: 196000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
With the SDK 35+ and NDK r28c+, build the generated project (arm64-v8a and x86_64) and run both programs on an emulator, software raster through `SDL_Renderer` (From the spike ZN-372, docs/reports/zinc-next-mobile-spike.md, D59.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 screenshots of both in the report
- [x] #2 the hello output in logcat equals its golden
- [x] #3 what had to change in `hal_sdl.cpp` is listed (criterion 1 of ZN-372, Android half)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-16 on the owner's device instead of an emulator (his request of the day): Nexus 7 2012, Android 7.1.2 (API 25), armeabi-v7a, Tegra 3 (GLES 2 only), 1 GB. Report: docs/reports/zinc-next-android.md, screenshots and hello's logcat in docs/reports/zinc-next-android/.

AC1: rn-showcase screenshots (first pixels, the perf panel on the software raster, the same on the GLES 2 replay) and breakout's; hello is a console program (it draws nothing and the activity ends when it does): its proof is its logcat, kept as hello-logcat.txt. AC2: logcat tag zinc of hello equals `zinc run examples/hello` (29 lines, diff empty; /tmp/zn-scripts/hello.sh did install, start, logcat -s zinc:I, diff). AC3: the hal_sdl.cpp table of the report: the app event queue (zn_hal_sdl_event), the live-resize watcher only on the drawing thread (the UI-thread redraw crashed Tegra 3's eglMakeCurrent at the first rotation), fill + whole zoom from the display scale on Android, sim_turn only with ZN_HAL_GL (a compile error of every non-GL build), the GLES 2 replay path (ES 2 context, GLR_CORE 0, #version 100, no VAO, depth 16) off by default on Android.

Also in this commit: sys_host.cpp reads /proc/loadavg below API 29; shell_sdl.cpp takes Zinc variables from the launch (`am start ... --es zinc.env "ZINC_PERF_HUD=1 ZINC_PROFILE=1"`, read through JNI) and from zinc.json "dev".perfHud baked by the export (ZN_APP_DEV_ENV), in debuggable builds only; the export compiles the engine and SDL at -O2 in a debug APK too (AGP builds it as Debug: the runtime was at -O0); CMake: ZN_HAL_GL and libGLESv2 on Android.

Measured (debug APK, one ABI, engine -O2): hello 2.46 MB, rn-showcase 6.12 MB (release unsigned 5.99 MB, libmain.so text 5.8 MB stripped, LOAD align 0x4000, stored uncompressed, extractNativeLibs=false), breakout 5.10 MB. Start (am start -W TotalTime): 450 to 640 ms warm, 741 ms after dropping the page cache. Software raster: rn-showcase 60.0 fps idle, work p50 1.38 p99 4.3 ms, present p50 15.0 p99 17.4 to 19.9 ms; scrolling by hand 25 fps (raster ~23 ms, present ~13 ms); breakout 59.9 fps, work p50 0.26 p99 1.5, present p50 16.2 p99 22.7. GLES 2 replay: rn-showcase 13.7 fps, present p50 89 p99 158 ms (whole frame replayed each time); breakout present p50 16.3 p99 32.8. hero: not exported, zinc:video needs FFmpeg (pkg libavformat).
Owner, on the device: everything works, responsive layout and rotation OK, touch OK, "fluidité perceptible mais c'est ok".
First interaction (owner's report, measured, not fixed): worst frame at the first tap 42.0 ms warm / 41.8 ms cold (page cache dropped) / 42.4 ms with 4 cores and the performance governor; second tap 51.9 / 55.8 / 51.4 ms. Each tab switch costs ~11 ms input + ~10 ms layout, the first one no more than the next; CPU hotplug changes nothing. Any Magisk su during a run made every other present ~105 ms for the whole run (18 s): the measurements use none. Not measured: touch-to-frame latency, page faults of the mapped libmain.so.

Heap decision (for the coordinator): the 512 MiB desktop region cannot be had on a 1 GB 32-bit device; the shell sets ZINC_HEAP to the android profile's heap (128 MiB, baked by the export as ZN_APP_HEAP_MB) capped at a quarter of SDL_GetSystemRAM(), ZINC_HEAP from the launch overriding it; the same 128 MiB is the program's mimalloc budget. Revisit when a program declares more.

Lines for later.md:
- ZN-622: the GLES 2 replay replays the whole frame on Tegra 3 (89 ms p50 against 15 ms for the software raster): make it damage-aware before it is Android's default (ZN-627).
- ZN-622: arm64-v8a and x86_64 builds of the export and an emulator smoke run: only armeabi-v7a was built and run.
- ZN-622: hero on Android needs zinc:video without FFmpeg system libraries (MediaCodec, or a vendored decoder): ZN-628.
- ZN-622: mimalloc warns "unable to allocate aligned OS memory directly" for the 128 MiB budget on 32-bit Android, in logcat at every start.
- ZN-622: touch-to-frame latency and page faults of the mapped libmain.so on the Nexus 7 (simpleperf, page-fault counters): the first-touch report is not explained by the engine's frames.
- ZN-622: on iOS, CMakeLists.txt's window section tests APPLE (Cocoa, OpenGL.framework, the window module): scope it to Darwin with the iOS export.
<!-- SECTION:NOTES:END -->
