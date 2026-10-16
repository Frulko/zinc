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
  (baked by the export); a release build takes neither. zinc.json `targets.android` `fullscreen` and `kiosk` are baked for every build
  (`ZN_APP_ENV`, applied first): `fullscreen` is SDL's immersive sticky mode (no status bar nor navigation buttons, the window takes the
  whole screen); `kiosk` adds the screen kept on and the back button kept by the app.
- The screen sleeps as for any phone app: SDL keeps it on for every app by default (`FLAG_KEEP_SCREEN_ON`, seen on every Zinc app before),
  so the shell sets `SDL_HINT_VIDEO_ALLOW_SCREENSAVER` unless the app is a kiosk. A program keeps it on with `navigator.wakeLock`
  (zinc:sys `wakelock`). Why: an app is a phone app or a web page, not a game; a screen that never sleeps drains a battery, and the program
  that needs it on says so.

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
| Software raster through SDL_Renderer (ZN-622; `ZINC_PRESENT=texture` since ZN-743): frame | | 60.0 fps, 16.66 ms; work p50 1.38 p99 4.3 ms; present p50 15.0 p99 17.4 to 19.9 ms (300 to 700 frames) | 59.9 fps, 16.68 ms; work p50 0.26 p99 1.5 ms; present p50 16.2 p99 22.7 ms |
| GLES 2 replay (`ZINC_RENDERER=gl`): frame | | 13.7 fps, 72.9 ms; work p50 1.98 p99 23.4 ms; present p50 89 p99 158 ms | present p50 16.3 p99 32.8 ms |
| Output | logcat (tag `zinc`) equals `zinc run ../examples/hello`, 29 lines | | |

- The owner, on the device: everything works, responsive layout and rotation, touch; "fluidité perceptible mais c'est ok".
- Scrolling the rn-showcase feed by hand: 25 fps, frames of about 40 ms (raster about 23 ms, present about 13 ms): a full-screen raster of
  1280 x 800 on the A9 cores is the cost; idle frames are at the display's 60 Hz.
- The GLES 2 replay draws correct pixels (screenshot) but replays the whole frame (damage 100%) and Tegra 3 takes about 90 ms for it; the software
  raster redraws only the damaged rows. Android keeps the software raster by default (`hal_sdl.cpp`); a damage-aware replay is the next step.
- hero does not export yet: it uses zinc:video, whose plugin needs FFmpeg (`pkg` libavformat), which an app cannot link yet (ZN-628).

### Zero-copy present (ZN-743)

Where the present of the software raster went (ZN-622's path: the raster into `fb`, `SDL_UpdateTexture`, the SDL_Renderer's GLES 2 quad,
`SDL_RenderPresent`), measured with `ZINC_PRESENT_STATS=1` (per step, p50 and p99 over 120 frames, in logcat) and a trace of a scripted fling
(`ZINC_INPUT`, which a window takes now too: ten flings of 400 px, rn-showcase, the frames that rasterized more than 2 ms):

| Step (texture path) | at rest | while scrolling |
|---|---|---|
| raster of the damaged rows | 0 (no damage) | 25 to 26 ms |
| `SDL_UpdateTexture` of those rows | 0 | 9.4 to 9.8 ms (breakout, 1 to 3 rows: 14.5 ms, it waits for the GPU still reading the texture) |
| `SDL_RenderClear` + `SDL_RenderTexture` | 0.02 ms | 0.02 ms |
| `SDL_RenderPresent` (eglSwapBuffers, vsync) | 14 to 15 ms (the display's period) | 1.6 to 1.8 ms |

Now the raster writes the damaged box straight into the window's own buffer (`hal_sdl.cpp` `anw_present`): `ANativeWindow_lock` with the box as the
dirty bounds (Android copies the rest from the previous buffer), `HalFrame.render_box` draws every pixel of the box it returns, `unlockAndPost`;
no SDL_Renderer, no texture, no GL context; SurfaceFlinger composes the buffer. The buffer is `BGRA_8888` (HAL format 5), the raster's own
byte order, so nothing is converted; `ZINC_PRESENT=565` packs into `RGB_565` from `fb` (no dither: the card gradients band visibly), and
`ZINC_PRESENT=texture` keeps the old path. Frames without damage post nothing and are paced at 60 Hz by a sleep; a post waits in the buffer queue.

| rn-showcase, scripted fling (moving frames) | interval p50 / p99 | raster p50 | present without the raster p50 / p99 |
|---|---|---|---|
| texture (before) | 40.6 / 60.7 ms (24.6 fps) | 26.0 ms | 12.8 / 18.2 ms |
| window buffer (now, the default) | 31.3 / 53.7 ms (31.9 fps) | 25.6 ms | 4.2 / 20.2 ms |

At rest both are at 60 fps (present p50 14.5 and 14.8 ms: the wait for the display); breakout is at 60 fps on both (present p50 16.27 and
16.37 ms, p99 26.6 and 26.2). The present lost 8.6 ms of its 12.8; the raster of the scrolled area (26 ms) is what remains, ZN-744's subject.

Pixels: `ZINC_PRESENT_VERIFY=1` compares the whole window buffer with a full redraw at every post: 0 stale pixels in 480 posts of the fling
(partial boxes: the panel, the scroll indicator, the feed). A screencap cannot prove equality on this device: Tegra 3 composes at mediump
precision and resamples (the texture path differs from a desktop raster of the same frame on 28,925 edge pixels, max 32 levels; the window
buffer on 20,077, max 20: the compositor's own share).

### A GPU layer under the software frame (ZN-746)

zinc:gfx runtime shaders (shaderProgram, drawShader, shaderAvailable) are drawn by the GPU without the GL replay of the whole frame: a
program that makes a shader before its first frame gets a GL window (its buffer was never locked by the CPU, so EGL can still take it); each
frame GL draws the frame's SHADER commands (at 1 / scale of the screen when the program allows it), then the software frame over them, its
damaged rows rendered with holes where the shaders are (twice, holes black and white: alpha and premultiplied colour) and uploaded. A change of
the shaders' uniforms alone is no damage: an animated shader under a still UI costs the CPU nothing. The music app's lava face: 4.0 fps with
its PNG round trip and four taps, 22 fps with one smooth stretch of a raw picture on the CPU, 61 fps as a shader at a quarter of the
resolution (24 fps at full resolution: Tegra 3 needs about 40 ms to shade and blend 1280 x 704). ZINC_GPU_LAYERS=0 keeps the CPU window,
ZINC_SHADER_SCALE overrides the scale.

### The GLES 2 replay: a scroll on the GPU, one capability record (ZN-741, ZN-744)

`ZINC_RENDERER=gl` (not the default yet). rn-showcase (the shell of 2026-10-16 19:09), its Components screen flung ten times by `ZINC_INPUT`,
perf panel on, moving frames 170 to 890:

| Step | Late frames (> 16.7 ms apart) of 720 | interval p99 |
|---|---|---|
| Software raster (ZN-743's direct path), three runs | 228, 222, 263 | 29.4, 26.8, 28.3 ms |
| GLES 2 replay of the damage box (before) | 96 (fewer frames: a scroll frame replayed the whole area, 40 to 56 ms; the input is counted in frames) | 56.8 ms |
| + a scroll moves the texture's pixels on the GPU (copy and draw back), only the rectangles left replayed | 384 | 32.2 ms |
| + lean programs on Tegra 3 (tuning table), no window clear on an immediate GPU | 384 → 386 (flat) | 32 ms |
| + the scrolled area kept turned in the texture (no pixel moves, the window quad drawn in pieces), three runs | 225, 228, 285 | 32.1, 31.6, 32.5 ms |
| same, perf panel off (software raster off-panel: 270, p99 31.5) | 221 | 29.5 ms |

Where the time goes (`ZINC_GL_FINISH=1`: every step waits for the GPU): the window quad 4.2 ms (5.4 with the clear an immediate GPU does not
need), the move 3.9 to 5.2 ms (gone with the turned rows), the replay of the rectangles 10 to 13 ms: a pass costs Tegra 3's CPU 1 to 3 ms
before any pixel and the GPU about 70 ns a pixel of a strip (a 1280x50 strip of cards and text: 4.5 ms; the software raster draws it in about
1 ms on the four A9 cores). At rest both paths are at 60 Hz (1 late frame of 230); in tab switches GLES 2 has 23 late of 450, the software
raster 20 (the screens' own effects and layout, 30 to 118 ms, dominate both). So the replay is as fast as the software raster at rest and in a
tab switch and within a few milliseconds of it in a fling: Android keeps the software raster by default.

Tried and dropped: one pass over the union of the rectangles with the depth buffer as a mask (GPU 7 to 19 ms: the GPU shades every quad
before the test); rotating vertex buffers (no change: the driver did not wait on them); the software raster under a GL window that only moves
and presents (`glTexSubImage2D` on Tegra 3: 26 to 30 ms a frame into the presented texture, 7 to 10 ms into staging textures, about
100 MB/s).

The capability record (`runtime/gl_caps.h`): `ZINC_GL_INFO=1` prints it on every provider (the SDL3 window on desktops and Android,
display-gl's KMS/EGL and webOS SDL 1.2). Nexus 7: `OpenGL ES 2.0, NVIDIA Tegra 3 (family Tegra 3)`, fragment highp no, mediump 13 bits,
surface depth 16 stencil 8, max texture 2048, no npot, VAO, instancing, 32-bit indices, packed depth-stencil nor depth24, framebuffer fetch
(NV), derivatives, ETC1, S3TC, half floats; EGL swap-with-damage but no buffer age nor partial update nor a preserved swap; tuning: immediate
(not a tiler), lean programs.

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

## Music remote on Android (examples/music, 2026-10-16)

The TouchPad's Sonos and Spotify wall remote (`examples/music`, zinc:sonos, zinc:spotify, zinc:socket UDP, zinc:fs, zinc:webos, AsyncStorage,
gsap) on the same Nexus 7, with no change to the program:

```sh
zinc export examples/music --target android -o dist/music-android
cd dist/music-android && ./gradlew assembleDebug -Pzinc.abis=armeabi-v7a     # APK 16.0 MB (debug, one ABI)
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n dev.zinc.music/.MusicActivity                          # start 526 to 613 ms
```

| | On the Nexus 7 |
|---|---|
| Sonos discovery (SSDP M-SEARCH from a UDP socket on port 37451, unicast answers) | Works with no MulticastLock: the group, what plays, the cover, the progress, live (`music-player.png`) |
| Transport, volume | Pause and play on the speakers ("En pause", then "En lecture" with the progress going on); the volume slider moved the group from 9 to 13 and back, the room sliders follow (`music-volume.png`) |
| HTTPS (radio logos from upload.wikimedia.org and others, radio-browser.info) | Works once the engine reads Android's root store (below) (`music-radios.png`) |
| The screen | `"android": { "kiosk": true }` in its zinc.json: the whole 1280 x 800 screen, no status bar nor navigation buttons (`music-kiosk.png`; `dumpsys window`: frame `[0,0][1280,800]`, `fl=#1810580` = `FULLSCREEN` and `KEEP_SCREEN_ON`, `vsysui=0x1706` = immersive sticky, fullscreen, navigation hidden); the back button stays in the app, Home leaves. Without kiosk (`--es zinc.env ZINC_KIOSK=0`): `fl=#1810900`, no `KEEP_SCREEN_ON`, the 1280 x 704 window between the bars |
| The wall remote's dimming (zinc:webos `setBacklight`) | After the delay (10 s for the check, then back to 120) the window's brightness goes to 0 (`dumpsys window`: `sbrt=0.0`) over a black picture with the flags above kept, and the next touch gives the system's back (no `sbrt`); the screen stays on (`Display Power: state=ON`) |
| Spotify | Not connected: no `spotify.json` on the tablet (below) |

What it took, each where every program benefits:

- **The plugins' requirements.** socket, sonos, spotify and osc required `process` (meaning "an OS"), which the `android` profile has not;
  none spawns a child process. They require `net` now (spotify `net` and `fs`).
- **Root certificates.** An app has no `/etc/ssl`, and `/proc/self/exe` is `app_process`, so no HTTPS request could be verified.
  `src/host/tls.cpp` reads `/system/etc/security/cacerts` (135 PEM files on this tablet) and the user's added roots beside it.
- **zinc:webos on a phone.** Unchanged: off webOS its helper requests are `device()` queries of zinc:sys, which the Android host now answers
  for the two that a phone has: `wakelock` (SDL's screen saver off or on, as `navigator.wakeLock` wants) and `backlight` (the window's
  `screenBrightness`, 0 or -1 for the system's, set on the UI thread by the exported activity through `SDL_SendAndroidMessage`,
  `ZN_APP_ANDROID_BRIGHTNESS`). `performance` and `port` answer false as on a desktop: a phone has neither a governor stuck at 192 MHz nor a
  firewall for an app's own sockets, and the program does not look at the answers. `isWebOS()` is false (no `libpdl.so`), so the TouchPad
  paths (`screenTimeout`, the power activity) are not taken.

The files beside the program (`config.json`, `radios.json`, `spotify.json`, read with zinc:fs by relative paths) are in the app's files
directory, the shell's working directory (`/data/data/dev.zinc.music/files`, `src/app/shell_sdl.cpp`). The program writes `config.json` there
itself at the first start. To bring one from a computer to a debuggable APK:

```sh
adb push spotify.json /data/local/tmp/ && adb shell run-as dev.zinc.music cp /data/local/tmp/spotify.json files/ && adb shell rm /data/local/tmp/spotify.json
```

Spotify was not tried: the login is a PKCE refresh token that Spotify rotates at each refresh, so a copy of the TouchPad's `spotify.json`
would log one of the two devices out at the first refresh. The tablet needs its own login (`python3 plugins/spotify/login.py <CLIENT_ID>
spotify.json` on the Mac, then the commands above).

Seen on the way: `adb shell input tap` (the press and the release within a few milliseconds) did not reach the program's buttons, while a press
held 120 ms (`input swipe x y x y 120`) did; a finger works.
