# Zinc Next on Android: first run on a Nexus 7 2012

2026-10-16, ZN-618 to ZN-622 (D59, `zinc-next-mobile-spike.md`, `zinc-next-mobile-core.md`). The device: Nexus 7 2012 (`grouper`),
LineageOS 14.1 = Android 7.1.2 (API 25), Tegra 3 (4 x Cortex-A9, armeabi-v7a with NEON, OpenGL ES 2.0 only), 1 GB of RAM, 1280 x 800 at
213 dpi, over USB (adb). Every number below was measured on it; nothing ran on an emulator.

## How an app is made

```sh
zinc export examples/rn-showcase --target android -o dist/rn-showcase-android   # SDL's own Gradle project, changed as listed in src/cli_core.cpp
cd dist/rn-showcase-android
./gradlew assembleDebug -Pzinc.abis=armeabi-v7a     # all three ABIs without -P: armeabi-v7a, arm64-v8a, x86_64
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n dev.zinc.rn_showcase/.Rn_showcaseActivity --es zinc.env "ZINC_PERF_HUD=1 ZINC_PROFILE=1"
```

Needs: the Android SDK (`ANDROID_HOME`), NDK r29 (29.0.14206865), a JDK 17 to 21 (Android Studio's `jbr`); the wrapper fetches Gradle 8.14.3
(pinned by its sha256) and the Android Gradle Plugin 8.13.2, and AGP fetched the SDK's CMake 3.22.1 by itself on the first build.

- The project is SDL 3.4.16's `android-project/` (vendored whole in `next/third_party/SDL3`), changed the way SDL's
  `build-scripts/create-android-project.py` changes it, plus a short list of Zinc changes (ZN-621 notes): an SDL upgrade is a re-copy.
- `libmain.so` = the program's AOT C++ (`ZN_AOT_CPP_ONLY=1 zinc build --profile android`), the shell `next/src/app/shell_sdl.cpp` (SDL3 main
  callbacks over `include/zn/app.h`), the engine library `zn_app` with SDL3 inside, and the program's plugins compiled from their sources.
- minSdk 24: libuv calls `pthread_barrier_*`, in bionic since API 24 (SDL3 alone needs 21). `posix_spawn` (API 28) is declared weak with the
  NDK's `__ANDROID_UNAVAILABLE_SYMBOLS_ARE_WEAK__`: an app never spawns, the linker drops `uv_spawn`.
- The native library is stored uncompressed and 16 KB aligned in the APK and mapped from it (`extractNativeLibs=false`, LOAD alignment 0x4000).
- An app has no environment: a debuggable build takes Zinc variables from the launch (`--es zinc.env "..."`) and from zinc.json `"dev": {"perfHud": true}`
  (baked by the export); a release build takes neither.

## What changed in hal_sdl.cpp (criterion 3 of ZN-372, Android half)

| Change | Why |
|---|---|
| Events come first from a queue that `zn_app_event` fills (`zn_hal_sdl_event`, 256 events, a mutex), then from `SDL_PollEvent` | With SDL's main callbacks the shell takes the events off SDL's queue; lifecycle events arrive from Android's UI thread |
| The live-resize event watcher redraws only on the drawing thread (`SDL_IsMainThread`) | Android delivers size changes from its UI thread: the redraw there made the GL context current on a second thread and crashed the Tegra 3 driver in `eglMakeCurrent` at the first rotation |
| `fill` on Android and a zoom from the display scale (whole numbers only: 1.33 stays 1) | The window is the screen; the program follows it (rotation works) |
| The simulator's picture turn (`sim_turn`) compiled only with `ZN_HAL_GL` | The file did not compile without the GL window (a bug of every non-GL build) |
| `ZN_HAL_GL` on Android with an OpenGL ES 2 context, `GLR_CORE 0` (the replay's GLES 2 path of `plugins/display-gl`), `#version 100` shaders, no VAO, a 16-bit depth buffer; off by default (`ZINC_RENDERER=gl`) | The GLES 2 replay works on Tegra 3 but is slower than the software raster there (below) |

Also, outside the HAL: `sys_host.cpp` reads `/proc/loadavg` below API 29 (no `getloadavg` in bionic before); Yoga links `liblog`.

## The heap

`ZRT_HEAP_BYTES` (512 MiB, one region allocated at start) cannot be had on this device: a 32-bit process with about 400 MB free. The shell sets
`ZINC_HEAP` before `zn_app_init`: the `android` profile's heap (128 MiB, `src/frontend/profile.cpp`, which `zinc export` bakes as
`ZN_APP_HEAP_MB`), capped at a quarter of `SDL_GetSystemRAM()`; `ZINC_HEAP` from the launch overrides it. The profile's heap is also the program's
mimalloc budget. Why 128 MiB: rn-showcase and breakout run within it, it leaves the system and the GPU driver the rest of a 1 GB device, and the
region is only reserved address space until it is touched. Revisit with zinc.json `targets.android` heap needs once a program needs more.

## Measured on the Nexus 7 (debug APK, armeabi-v7a, engine at -O2)

| | hello | rn-showcase | breakout |
|---|---|---|---|
| APK (debug, one ABI) | 2.46 MB | 6.12 MB | 5.10 MB |
| APK (release, unsigned) | | 5.99 MB (`libmain.so` 5.9 MB: text 5.8 MB, stripped) | |
| Start, `am start -W` TotalTime (warm) | 600 to 634 ms | 460 to 640 ms | 454 to 582 ms |
| Start after dropping the page cache | | 741 ms | |
| Software raster (default): frame | | 60.0 fps, 16.66 ms; work p50 1.38 p99 4.3 ms; present p50 15.0 p99 17.4 to 19.9 ms (300 to 700 frames) | 59.9 fps, 16.68 ms; work p50 0.26 p99 1.5 ms; present p50 16.2 p99 22.7 ms |
| GLES 2 replay (`ZINC_RENDERER=gl`): frame | | 13.7 fps, 72.9 ms; work p50 1.98 p99 23.4 ms; present p50 89 p99 158 ms | present p50 16.3 p99 32.8 ms |
| Output | logcat (tag `zinc`) equals `zinc run ../examples/hello`, 29 lines | | |

- The owner, on the device: everything works, responsive layout and rotation, touch; "fluidité perceptible mais c'est ok".
- Scrolling the rn-showcase feed by hand: 25 fps, frames of about 40 ms (raster about 23 ms, present about 13 ms): a full-screen raster of
  1280 x 800 on the A9 cores is the cost; idle frames are at the display's 60 Hz.
- The GLES 2 replay draws correct pixels (screenshot) but replays the whole frame (damage 100%) and Tegra 3 takes about 90 ms for it; the software
  raster redraws only the damaged rows. Android keeps the software raster by default (`hal_sdl.cpp`); a damage-aware replay is the next step.
- hero does not export yet: it uses zinc:video, whose plugin needs FFmpeg (`pkg` libavformat), which an app cannot link yet (ZN-628).

### The first interaction (owner's report: the first touch is slow)

Cold launch, the panel and a trace (`ZINC_TRACE`), a tap on Settings at 3 s, a tap on Stats about 2 s later; worst frame (and the gap between
frame starts) at each tap, from the trace:

| Run | Start | Tap 1 worst frame | Tap 2 worst frame |
|---|---|---|---|
| Warm (default CPU settings: autosmp min_cpus 1, intelliactive) | 482 ms | 42.0 ms (input 11.0, layout 9.5, raster 5.6, present 18.3) | 51.9 ms (input 11.6, layout 10.1, raster 15.4, present 29.1) |
| Page cache dropped, launched 45 s later | 741 ms | 41.8 ms (input 11.7, layout 10.3, raster 5.8, present 16.8) | 55.8 ms (input 11.2, layout 13.6, raster 17.1, present 28.5) |
| 4 cores online, performance governor | 506 ms | 42.4 ms | 51.4 ms |

In the engine, the first tap costs what the second does (a screen switch: about 11 ms of input handling and 10 ms of layout, every time), and
CPU hotplug changes nothing. One more finding: any `su` through Magisk (it starts a Java root server) made every other frame's present take
about 105 ms for the whole run that followed (18 s), with or without a tap; the runs above use no root command during the measurement. Not
measured: the latency from the touch to the first frame that answers it (outside the engine's frames) and page faults of the mapped
`libmain.so`; a trace with `simpleperf` or the kernel's page-fault counters would.

Screenshots: `zinc-next-android/rn-showcase-first-pixels.png`, `rn-showcase-panel-cpu.png`, `rn-showcase-panel-gles2.png`,
`breakout-panel-cpu.png`; hello's logcat: `zinc-next-android/hello-logcat.txt`.

## Not done here

Lifecycle events to the program, context loss, safe areas, the back button and IME (ZN-625, ZN-626), plugins with android entries (ZN-628),
signing (ZN-629), arm64-v8a and x86_64 builds (the export lists them; only armeabi-v7a was built), an emulator run.
