# The Zinc core on Android and iOS: one engine, a thin embedder

Date: 2026-10-16. Asked by the owner while the Android chain ZN-618 to ZN-622 runs ("imagine bien le truc et comment le cœur peut
marcher avec tout ça, car on veut ensuite porter sur iOS"). Builds on the spike (`zinc-next-mobile-spike.md`, D59) and on the webOS
port (`docs/reports/hardware/hp-touchpad-webos.md`). First device: Nexus 7 2012 (Android 7.1, armeabi-v7a, GLES 2, 1 GB);
`docs/reports/hardware/nexus7-2012-research.md`. References named by the owner: Flutter, React Native, Lynx, PocketJS, LÖVE.

## 1. The shape in one picture

```
 program (Zinc TS/TSX)  ── AOT C++ (store builds) or ZBC bytecode (player, dev)
 prelude (lib, in Zinc) ── timers, promises, __loopStep(), __gfxStep(): one turn, one frame, never a loop that blocks
 engine core (C++, static lib zn_app) ── rt, gfx command lists, layout (Yoga), text, codecs, libuv, packs, plugins (static registry)
 embedder contract (C ABI, include/zn/app.h) ── zn_app_init / zn_app_iterate / zn_app_event / zn_app_quit
 host HAL (hal_*) ── surface, input, lifecycle, time, storage, resources, log; one implementation per family
 shell ── SDL3 main callbacks (desktop, Android, iOS, web) | KMS, webOS, ESP32, wasm worker shells
 package ── zinc export: Gradle project (Android), Xcode project (iOS), the same generator family as .deb/.dmg
```

The rule: **the engine never owns the run loop on a phone; the embedder does, and calls the engine once per tick.** This is
Flutter's embedder model (the platform supplies task runners and vsync, the engine renders a frame when asked) and SDL3's main
callbacks; LÖVE's `love.run` and today's `__gfxLoop` are the same loop with the body cut out.

## 2. What we take from each reference

| Reference | What it does | What Zinc takes |
|---|---|---|
| Flutter | Engine as a library behind `flutter_embedder.h`; the embedder (FlutterActivity, FlutterViewController) owns threads, vsync (Choreographer, CADisplayLink) and the surface; own pixels (Impeller: Metal on iOS, Vulkan with a GLES fallback on Android); AOT in release; a semantics tree mirrored to the platform accessibility APIs | The embedder contract (§3), vsync from the platform, surface created/destroyed as events, GPU objects as rebuildable caches, AOT for stores, the accessibility mirror (ZN-630) |
| React Native (new architecture) | One C++ core shared by iOS and Android (Fabric renderer, Yoga, JSI); TurboModules: typed native modules with generated bindings; Hermes bytecode compiled ahead of time; Expo: `prebuild` generates the native projects, Expo Go runs any project in development | The shared C++ core with platform code only at the edges; plugins as typed native modules linked statically (ZN-628), their bindings generated from `plugin.json`; `zinc export` = `expo prebuild`; a player app = Expo Go (ZN-631) |
| Lynx | C++ core, dual thread: a main-thread script for the first frame and gestures, app logic on a background thread; native views | Its goal, not its threads: the first frame is drawn before anything slow (packs mapped, fonts lazy); a second thread for the program only if a measured frame shows the UI blocked by program work, never by default on a 1 GB device |
| PocketJS | QuickJS + a small native core that emits a 10-op draw list, one tiny backend per GPU (GU, GXM, citro3d, GLES 1.1 on the iPhone 4S); baked styles | The draw list is the portable boundary (our command lists); one backend per GPU family, chosen at run time; old hardware is a target, not an afterthought |
| LÖVE | `love.run` over SDL; `conf.lua` declares which modules load; a generic player APK opens any `.love`, a fused build puts `game.love` in the APK assets or the iOS bundle | `zinc.json` capabilities decide what links; the same engine as a **player** (interpreter, opens a `.zapp` from the Mac or a file) and as a **fused app** (AOT program + `.zapp` assets inside the package) |

## 3. The embedder contract (`include/zn/app.h`, ZN-620)

```c
int  zn_app_init(int argc, char** argv);  // the module's top level, up to where the loop would start. 0 running, 1 done, <0 error
int  zn_app_iterate(void);                // one turn: a frame of __gfxStep when the program draws, else due timers + uv_run NOWAIT
void zn_app_event(const void* sdl_event); // input, resize, density, safe area, lifecycle: queued for the next turn
void zn_app_quit(void);                   // flush console output, finish gfx, free the heap
int  zn_app_main(int argc, char** argv);  // desktop and tests: init, then iterate until done (today's behaviour, same goldens)
```

- The SDL3 shell is `SDL_AppInit/AppIterate/AppEvent/AppQuit` calling these one to one (`SDL_MAIN_USE_CALLBACKS`). SDL runs them on
  the main thread on iOS and on its native thread on Android; the engine needs nothing else.
- Frame pacing: `iterate` is the vsync tick. In app mode `gfxPoll` does not block and `loopWait` does not sleep; a program with no
  frame callback and no pending work returns 1 and the shell exits (console programs).
- Why not one blocking `zn_app_main`: SDL3 accepts a blocking loop on iOS and Android, but the system then gets control back only
  inside `SDL_PumpEvents`. Background, Game Center, CADisplayLink pacing and a browser main thread all want the callback form; one
  form for every platform is less code than two.

## 4. Lifecycle, memory, GPU

- **Lifecycle** (SDL `WILL/DID_ENTER_BACKGROUND`, `WILL/DID_ENTER_FOREGROUND`, `LOW_MEMORY`, `TERMINATING`): reach the program as
  events (`zinc:app` `onPause`, `onResume`, `onLowMemory`), as React Native's AppState and Flutter's `AppLifecycleState`. On pause the
  shell stops calling `iterate`, timers are frozen, `storage` is flushed; iOS gives about 5 s.
- **GPU objects are caches.** Android destroys the EGL surface on pause and may lose the context; iOS forbids GL in the background.
  The replay keeps what it needs to rebuild textures and atlases from CPU data (packs, the glyph cache, decoded images) and
  rebuilds after `SDL_EVENT_RENDER_DEVICE_RESET` or a new surface.
- **Back ends, chosen at run time by what the context offers**: software raster through `SDL_Renderer` (works everywhere, the first
  pixels); the GL replay with `GLR_CORE 0` (GLES 2: the Nexus 7, the Pi, webOS: already written in `plugins/display-gl`); GLES 3 / GL
  3.3; later a Metal replay on iOS (Flutter left GLES on iOS; OpenGL ES still runs there but is deprecated), decided by measure.
  Old Android devices stay on GLES 2; there is no Vulkan on Tegra 3.
- **Heap**: one region sized at start from the program's need (`zinc.json`) capped by a share of `SDL_GetSystemRAM()`, not the
  512 MiB desktop default. Low memory empties caches first (glyphs, decoded images), then tells the program.

### 4.1 One GLES 2 base for the Pi 3, webOS and old Android, tuned by what the GPU says (owner, 2026-10-16)

The Pi 3 (VideoCore IV), the HP TouchPad (Adreno 220) and the Nexus 7 (Tegra 3) share the problem: GLES 2 only, little memory,
low fill rate. Most Android devices do not (GLES 3, Vulkan), so the split is **by capability, not by platform**:

- **Base**: the GLES 2 replay (`runtime/gl_replay.cpp`, `GLR_CORE 0`, used by `plugins/display-gl`): one code path for every GLES 2
  context, whoever made it.
- **Context provider per platform**, and nothing else: KMS/GBM/EGL (Pi, `kms.cpp`), Palm's SDL 1.2 (`webos.cpp`), SDL3 (desktop,
  Android, iOS). It makes the context, gives the surface size and density, presents, and reports a lost context.
- **A capability record filled once per context** by the base (version, fragment `highp`, depth and stencil bits of the surface and of
  an FBO, max texture size, NPOT, VAO, instancing, 32-bit indices, framebuffer fetch, discard, compressed formats, renderer string),
  read by the replay instead of probes spread over `kms.cpp`, `display_gl.cpp` and `gl_replay.cpp` as today. Flutter's Impeller
  `Capabilities` and ANGLE's per-driver feature flags (with Chrome's GPU driver bug list keyed by the renderer string) are the model.
- **A small tuning table keyed by GPU family** for what capabilities do not say: tiler or immediate (VC4 and Adreno are tilers,
  Tegra 3 is not: clears and FBO switches cost differently), atlas size, render scale, frame cap.
- **A device class** from the record plus `SDL_GetSystemRAM()` (heap budget, glyph cache, image cache, render scale), the same rule on
  the Pi, the TouchPad and the Nexus 7.

Measured on the Nexus 7 (2026-10-16, NDK probe over an EGL pbuffer, as root; as the shell user the driver falls back to Tegra 2
limits because it cannot read the chip id):

| Capability | Tegra 3 (Nexus 7) | Consequence in the replay |
|---|---|---|
| Fragment `highp` | none; `mediump` 13-bit mantissa | distances and coordinates in the fragment shaders relative to the primitive, not in screen pixels (1280 px at 13 bits: about 0.15 px) |
| Window surface | depth 16, stencil 8 | POLY stencil fills possible on the window, not in an FBO |
| FBO depth/stencil | no `OES_packed_depth_stencil`, no `OES_depth24` | FBO depth 16 (65k commands told apart), POLY on the CPU tiles inside an FBO (already the fallback, D62) |
| Max texture | 2048 | atlases and image tiles at most 2048 |
| VAO, instancing, 32-bit indices | none | the GLES 2 path already avoids them; indices stay 16-bit |
| Vertex texture fetch | 0 units | no texture reads in vertex shaders |
| NPOT | no `OES_texture_npot` (only `NV_texture_npot_2D_mipmap`) | NPOT textures clamp-to-edge without mipmaps, or padded |
| Extras | `NV_shader_framebuffer_fetch`, `OES_standard_derivatives`, S3TC/DXT, ETC1, LATC, half-float textures | framebuffer fetch could replace some blending passes; S3TC for packs |

## 5. Files, resources, native code

- **Resources** go through one host call that returns a mapped range: on Android an `AAsset` file descriptor and offset (packs stored
  uncompressed in the APK, so `mmap` still works), on iOS the bundle (`SDL_GetBasePath`), on desktop the file. Writable data under
  `SDL_GetPrefPath` (`storage`, caches); temporary files in the app's cache directory.
- **Logs** through `SDL_Log` (logcat, os_log), so `console.log` of a phone app shows in `adb logcat` and Xcode.
- **No dlopen, fork or exec in an app.** Plugins are static archives registered at link time (as an AOT program does today);
  `process`, `tray`, `dynlib` are capabilities the mobile profiles do not have, refused by `zinc check` with the capability message.
- **Platform code per plugin**: C++ first; where the platform API is Java (Android) or Objective-C/Swift (iOS), a small file in the
  plugin for that platform, called through JNI or the Objective-C runtime from C++, as RN's TurboModules and LÖVE's Android glue do.

## 6. Build and the development loop

- One `libzn_app.a` per ABI (`armeabi-v7a`, `arm64-v8a`, `x86_64`; iOS `arm64` and the simulator), built by the platform clang
  (NDK, Xcode), cached under `ZINC_HOME`; the program's C++ from `zinc build` compiles into the generated project. The pinned zig is
  not used (no bionic, no iOS SDK).
- CMake uses explicit predicates: `ANDROID`; `CMAKE_SYSTEM_NAME STREQUAL "iOS"`. `APPLE` is true on iOS, so Cocoa-only code is
  guarded by macOS, not by `APPLE`. libuv needs its `[linux]` sources on Android and its `[darwin]` ones on iOS.
- Development: the **player** build (interpreter + ZBC, like Expo Go and the LÖVE player) receives the program from `zinc dev` over
  the LAN or adb and reloads it; release builds are AOT and fused. On iOS the player is a debug build only (store rule on code that
  was not reviewed).

## 7. Order of work

1. ZN-620 with the callback contract; desktop goldens unchanged (`zn_app_main`).
2. Android shell on SDL3, software raster: hello in logcat, rn-showcase on the Nexus 7 (ZN-621, ZN-622).
3. The GLES 2 base of §4.1: the capability record, the context providers (KMS, webOS, SDL3), the Nexus 7 as the third GLES 2
   device; frame times against the software raster on the Pi 3, the TouchPad and the Nexus 7.
4. Lifecycle, density, safe areas, back button, IME (ZN-625, ZN-626); resources from the APK.
5. Static plugins (ZN-628), the player and `zinc dev` (ZN-631), packaging (ZN-629).
6. iOS: the same shell with SDL3's UIKit backend, `zinc export --target ios` (Xcode project), then the Metal decision.

## 8. Not verified

- SDL3 main callbacks on Android API 25 with SDL 3.4.16 (expected: SDL documents callbacks on every platform).
- Context loss behaviour of the Tegra 3 driver on pause (does it keep the context with `SDL_HINT_ANDROID_BLOCK_ON_PAUSE`?).
- The reference rows come from general knowledge of those products and the sources of the spike; none was re-read for this note.
