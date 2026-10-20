# HP TouchPad (webOS 3.0) as a Zinc target

Status: research, 2026-10-13, asked by the owner (TouchPad Wi-Fi 32 GB, model HSTNH-I29C, webOS 3.0.0, boots, Touchstone
dock at hand). Sections 1 to 7 were written before the tablet was connected, from the cited sources and from builds
made on the development Mac with the pinned zig 0.15.2. **Section 8 holds what was then read on the tablet itself and
replaces every "not found" and "to read on the device" above it; section 9 is what was built and run on it the same day.** Sources are numbered [n] and listed at the end.

## 1. Summary

| Question | Answer |
|---|---|
| Build a Zinc app for it? | **Yes, with the pinned zig.** A C++20 program builds for `arm-linux-gnueabi` (ARMv7, NEON, soft-float calling convention as webOS wants [3]) against glibc 2.5 and 2.8 once `aligned_alloc` is supplied (absent before glibc 2.17, used by libc++); the result needs only `GLIBC_2.4` symbols. A static musl build also links. Not executed anywhere yet. |
| Send it to the tablet? | Developer mode (`webos20090606` in Just Type [9][10]) then `novacom` over USB. HP's driver is dead on current macOS; a rebuilt 64-bit `novacomd` on libusb is documented for macOS Sequoia [11][12]. Apps install as `.ipk` [7]. |
| HTTPS in Zinc apps? | **Already independent of the tablet**: Zinc has its own TLS (mbedTLS, `src/host/tls.cpp`), so the OpenSSL 0.9.8 of webOS [2] does not matter. One gap: the root store is read from `/etc/ssl/...` or `ZINC_CA_FILE`; the webOS store is from 2011. The app must carry a CA bundle. |
| webOS SDK access? | The PDK gives native code `PDL_ServiceCall` to the Luna bus (`palm://com.palm.*`), sensors, compass, location, vibration, orientation, keyboard [6]. A `webos` plugin wraps it. |
| Replace the webOS UI and keep the drivers? | **Plausible, unproven.** The UI is one process, LunaSysMgr, started by Upstart [1]; the drivers and the system services are separate. Three facts decide it and none was found on the web: how the Adreno libraries give a GL surface without LunaSysMgr, how touch reaches user space, and which services survive. All three are read in an hour on the device. |
| Risk | Low while the kernel, the bootloader and the partitions are untouched: recovery mode (Volume Up at power-on) plus webOS Doctor restores the system [22][23]. Doctor wipes user data. |

## 2. The hardware

| Part | Detail |
|---|---|
| SoC | Qualcomm APQ8060 (Snapdragon S3), two Scorpion cores at 1.2 GHz, NEON [3][14][20] |
| GPU | Adreno 220: OpenGL ES 2.0 [14]. For Zinc that is tier T2 (WebGL1), the class of the Pi 3. |
| Memory, storage | 1 GB RAM, 32 GB flash [20] |
| Screen | 9.7 in IPS, 1024x768, about 132 ppi [20] |
| Sensors | accelerometer, gyroscope, magnetometer, light sensor, microphone, stereo speakers, 1.3 MP front camera [20] |
| Radio | Wi-Fi (Atheros ath6kl, SDIO), Bluetooth [14][20] |
| Dock | Touchstone: `palm://com.palm.display` reports `dockMode: true` (Exhibition mode) [21] |

## 3. The system and the binary

- Linux 2.6.35 (modified), soft-float ABI (`-mfloat-abi=softfp`), NEON; HP's tool chain is gcc 4.3.3 [3][14]. That
  compiler cannot build Zinc (C++20), so the PDK is used for its **headers and device libraries only**.
- glibc and libstdc++ versions: not found. Read on the device (`/lib/libc.so.6` prints its version).
- Measured on the Mac (`zig c++ -std=c++20 -target arm-linux-gnueabi.<v> -mcpu=cortex_a8+neon -mfloat-abi=softfp`):

  | Target glibc | Result |
  |---|---|
  | 2.17 | links |
  | 2.5, 2.8, 2.11 | one undefined symbol, `aligned_alloc` (libc++'s `new.cpp`) |
  | 2.5, 2.8 with a 2-line `aligned_alloc` over `posix_memalign` | links; needs `GLIBC_2.4` only; `__ARM_PCS` = 1 (soft-float calls), `__ARM_NEON` = 1 |
  | `arm-linux-musleabi -static` | links |

  The test is a small program (threads, `std::span`, `printf`), not the engine: the engine's own link against an old
  glibc is the next proof.
- Open risks, all about the 2011 kernel: libuv 1.53 (vendored) supports Linux from 3.10 (from memory of its platform
  notes, not checked for this report) and reaches older kernels only through its `ENOSYS` fallbacks; mimalloc and the zig start code assume recent kernels by default. Only a run on the tablet tells.
- The existing `armv7-linux` target (`src/tc/tc.cpp`) is hard-float (`gnueabihf`): its binaries cannot call the
  tablet's soft-float GL libraries. A new target row is needed (`armv7-webos`: `arm-linux-gnueabi`, glibc floor read on
  the device, `-mcpu=cortex_a8+neon -mfloat-abi=softfp`).

## 4. Three steps, each one usable

1. **Console program and HTTPS** (no display). New target row, the `aligned_alloc` shim, a CA bundle shipped with the
   app (`ZINC_CA_FILE` today; a bundle found beside the program is the small change to make). Push with `novacom put`,
   run in the root shell. Proves the runtime, libuv and mbedTLS on kernel 2.6.35. Also check the tablet's clock: a
   wrong date fails every certificate.
2. **A Zinc app as a webOS card** (the supported way, GPU included). A `display-webos` plugin, the size of
   `plugins/display-rmpp`: Palm's SDL 1.2 opens the GLES 2 context and delivers touch and keys, PDL gives services and
   sensors [2][6]. Linked against the PDK's device libraries (`-lSDL -lGLESv2 -lpdl`, `--allow-shlib-undefined` [3]),
   the way `src/tc/plugin_build.cpp` already links against a device sysroot. Package: `appinfo.json` with
   `"type": "pdk"`, `main`, `requiredMemory`, in an `.ipk` [7] (an `ar` archive like a `.deb`). PDK apps are full
   screen, so a Zinc launcher started as a card already looks like a shell, with webOS still underneath.
3. **Zinc instead of LunaSysMgr.** Stop the Upstart job and start a Zinc shell in its place, on the stock kernel with
   the Adreno libraries. LunaSysMgr is the compositor: PDK apps are composited by it into cards [2]. Without it, webOS
   apps (Enyo, PDK) have no screen: the replacement shell runs **Zinc apps only**. The services (power, Wi-Fi, audio)
   are separate daemons on the Luna bus [4][5] and should keep running; not verified.
   The reference to read first is HP's own source of this exact program: `openwebos/luna-sysmgr` and the Community
   Edition for the TouchPad (LunaCE) [1][7], for how it opens EGL on the panel and how it receives touch.

## 5. What the web did not answer (step 3 depends on it)

| Unknown | Why it matters | What is known |
|---|---|---|
| EGL without LunaSysMgr | the GPU path of the shell | No report found of GLES on the bare framebuffer of stock webOS. Library names and the native window type: not found. |
| Touch | no touch, no shell | On the later 3.4 kernel the Cypress panel is a UART bridge, a thin kernel driver and a user-space daemon (`ts_srv`) that does the work [11]. On webOS the daemon is probably `hidd`; its protocol: not found. `plugins/display-fbdev` expects evdev and may see nothing. |
| `/dev/fb0` | software fallback | Xorg's fbdev driver ran on the tablet [12][14], beside LunaSysMgr or on other kernels. Pixel format and flip ioctl on stock webOS: not found. |
| Luna bus from our process | battery, brightness, Wi-Fi, volume | The library is open (`openwebos/luna-service2` [4]); role files and service names of 3.0.x: not found. `PDL_ServiceCall` works only under LunaSysMgr's app model (inferred). |
| Upstart job location, exact stop command | the switch itself | Job files `LunaSysMgr.upstart`, `LunaReady.upstart` exist in the source [1]. |

## 6. Paths that drop the webOS drivers (for comparison)

- Android ports and postmarketOS use a downstream 3.4 kernel; on postmarketOS screen, touch, Wi-Fi and battery work,
  3D acceleration, audio, camera and Bluetooth do not [18][19].
- Mainline Linux 6.x: display with artifacts, no touch as of November 2025 [11].
- LuneOS on the TouchPad runs on Android drivers through libhybris, not on the webOS kernel [15][16].

None keeps the GPU working as well as stock webOS: for performance the stock kernel is the right base, as asked.

## 7. First session with the tablet

Before anything: the tablet stays on 3.0.0. Developer mode needs an activated device [10]; HP's activation servers are
off and the two bypass recipes found disagree on the Doctor version to use [15][16], so no Doctor run while it works.

```sh
novacom -l                                   # the tablet is seen
novacom run file://bin/sh -- -c '
  /lib/libc.so.6 | head -1; uname -a; cat /proc/cpuinfo | head -12
  ls /etc/event.d /etc/init 2>/dev/null | head -60          # Upstart jobs: LunaSysMgr, hidd, powerd...
  ps ax | head -80
  ls -l /dev/fb* /dev/input /dev/kgsl* /dev/msm* 2>/dev/null
  cat /sys/class/graphics/fb0/virtual_size /sys/class/graphics/fb0/bits_per_pixel
  ls /usr/lib | grep -iE "egl|gles|gsl|adreno|sdl|pdl|hid|nyx|lunaservice"
  ls /etc/ssl /etc/ssl/certs 2>/dev/null | head; date
  ls /usr/share/ls2/roles 2>/dev/null | head'
```

Then step 1 of section 4: the console program, then one HTTPS request.

## 8. Read on the tablet, 2026-10-13

Connection: developer mode was already on (the USB device shows the novacom interface, class 255 subclass 71, beside
the mass-storage one). On the Mac (Apple Silicon, macOS 15.7): `novacomd` built from `incidentist/novacomd`
(`make host` with Homebrew's `libusb-compat`), run with `sudo`; the client built from `openwebos/novacom`. Both are in
`~/.local/bin`. A script goes in on stdin: `novacom run file://bin/sh < script.sh`; a file with
`novacom put file://tmp/name < file`. The shell is root.

| Item | Value read |
|---|---|
| Build | HP webOS 3.0.0, Nova-HP-Topaz build 41 (2011-06-09) |
| Kernel | `2.6.35-palm-tenderloin`, SMP PREEMPT, armv7l |
| C library | **glibc 2.8** (Sourcery G++ 4.3-234); libstdc++ 6.0.10 |
| CPU features | `vfp neon vfpv3 thumb edsp`; 942 MB RAM, 572 MB free with the stock UI idle |
| Clock | **2024-07-19: more than two years late.** TLS fails on every current certificate until it is set. |
| Init | Upstart, jobs in `/etc/event.d`. `LunaSysMgr`, `hidd`, `ls-hubd_private`, `ls-hubd_public`, `powerd`, `audiod`, `pulseaudio`, `PmWiFiService`, `novacomd` are separate running jobs. |
| The UI job | `/etc/event.d/LunaSysMgr`: `respawn`, `exec /usr/bin/LunaSysMgr -s ...`. **The same script already starts another full-screen program in its place** (HP's factory tool `ted`, on DirectFB) when the kernel command line holds `MFTboot`. |
| Display | `/dev/fb0` and `/dev/fb1`, 1024x768, 32 bpp, virtual 1024x2304 (three pages), stride 4096; `/dev/kgsl-3d0`, `/dev/kgsl-2d0`, `/dev/kgsl-2d1` |
| GL libraries | `/usr/lib/libEGL.so`, `libGLESv2.so` (4.4 MB), `libGLES_CM.so`, `libOpenVG.so`, `/usr/lib/egl/libeglsubdrv.so`. `libEGL.so` needs only libc, libstdc++, libm, libdl, libpthread. LunaSysMgr links `libEGL.so` and `libGLESv2.so` directly (with Qt 4 `QtOpenGL`). |
| Touch | **Not an evdev device**: the kernel shows only `gpio-keys`, `pmic8058_pwrkey`, `headset`. Touch comes from `hidd` (`/etc/hidd/HidPlugins.xml`, plugin `libhidtouchpanel.so`) on the Unix socket `/var/run/hidd/TouchpanelEventSocket`; same scheme for `Keypad`, `Accelerometer`, `Compass`, `Light`, `Fusion`, `InputDev`. Client library: `/usr/lib/libhid.so`. |
| Palm's SDL | `libSDL-1.2.so.0.11.2` links `libLunaSysMgrIpc.so` and `libnapp.so`: it needs LunaSysMgr (step 2 only). `libpdl.so` is present. |
| Luna bus | `/usr/lib/liblunaservice.so`; `luna-send`, `ls-monitor`, `ls-control` in `/usr/bin`; role files in `/usr/share/ls2/roles/prv` (120 files) and `pub` |
| Certificates | `/etc/ssl/certs/ca-certificates.crt` is 1858 bytes (one certificate); OpenSSL 0.9.8. Zinc must bring its bundle. |
| Space | `/` 132 MB free, `/var` 55 MB, `/tmp` 40 MB (tmpfs); the 27 GB are the media partition (the one seen as a USB drive) |

**Proof run.** The two test programs of section 3 (C++20, threads, `std::span`; built on the Mac with the pinned zig)
were pushed to `/tmp` and run: the dynamic one (`arm-linux-gnueabi.2.8`, soft-float calls, NEON, with the
`aligned_alloc` shim) and the static musl one both print the expected line and exit 0. They were removed afterwards.
Nothing else was written to the tablet.

What this settles for section 5:

- **Touch**: answered. The shell reads hidd's socket (through `libhid.so`, or its packet format taken from the open
  `luna-sysmgr` source); hidd keeps running without LunaSysMgr since it is its own job.
- **Services**: power, audio, Wi-Fi and the two bus hubs are their own jobs: stopping LunaSysMgr does not stop them by
  itself (not yet tried).
- **The switch**: `stop LunaSysMgr` / `start LunaSysMgr` for a trial; an edited job file for a permanent shell.
- **EGL without LunaSysMgr**: still open, but narrowed: the library is self-contained and LunaSysMgr itself is an EGL
  client on the framebuffer. The trial is a 50-line EGL program run after `stop LunaSysMgr`.
- The target row is fixed: `arm-linux-gnueabi.2.8`, `-mcpu=cortex_a8+neon -mfloat-abi=softfp`.

Not done: the engine itself was not built for the tablet (no target row yet), no HTTPS request was made, LunaSysMgr
was never stopped, no `.ipk` was installed.

## 9. Built and run on the tablet, 2026-10-13

Branch `touchpad-webos`. Nothing is installed on the tablet: programs are pushed to `/tmp` and started from the Mac.

```sh
tools/webos-sysroot                      # once: the tablet's libGLESv2.so and the GLES headers, in ~/.zinc/sysroots/armv7-webos
ZINC_DISPLAY=gl build/zinc build --target armv7-webos examples/nuxt-ui/src/main.tsx -o nuxt-ui
llvm-strip nuxt-ui                            # 44 MB to 7 MB (zig's objcopy cannot strip)
novacom put file://tmp/nuxt-ui < nuxt-ui
echo 'cd /tmp; chmod 755 nuxt-ui; ZINC_SIZE=1024x768 ZINC_PERF_HUD=1 ./nuxt-ui < /dev/null &' | novacom run file://bin/sh
```

| Piece | What it is |
|---|---|
| Target `armv7-webos` (`touchpad`, `webos`) | `arm-linux-gnueabi.2.8 -mcpu=cortex_a8+neon -mfloat-abi=softfp`, plus `+vfp2` forced back (zig 0.15.2 turns it off for a gnueabi target and LLVM then dies on NEON intrinsics in zstd and mbedTLS) and no UBSan runtime (it calls `pwritev64`, glibc 2.10). Without `softfp` every number operation would be a library call. |
| `src/host/glibc_compat.c` | What glibc 2.8 lacks or has wrong, as system calls: `pipe2`, `accept4`, `dup3`, `epoll_create1`, `inotify_init1`, `recvmmsg`, `sendmmsg`, thread names; `eventfd` (2.8 refuses every flag: the libuv loop did not start) and `epoll_pwait` (a stub that answers ENOSYS without a system call: libuv saw no event and spun). `aligned_alloc` is in `src/rt/alloc.cpp`. |
| `plugins/display-gl/src/webos.cpp` | The GPU screen: a GLES 2 context from Palm's SDL 1.2 (`SDL_GL_CONTEXT_MAJOR_VERSION` is attribute 17 there), loaded with `dlopen`, so no PDK is needed. Reported by the driver: `Adreno (TM) 220, OpenGL ES 2.0`. Touch: one state per finger, so a release is always seen before the next press. |
| `plugins/display-webos` | The first, software-only screen (SDL surface, bands on both cores). Kept until the GPU path is proven on more demos, then to delete. |
| `src/host/tls.cpp` | A `cacert.pem` beside the program replaces the device's store. |

Results:

- Console program, `breakout`, `nuxt-ui`, `examples/ui/keyboard` run. Owner's eyes: display right, `breakout` fluid.
- HTTPS (after the clock was set, with `cacert.pem` beside the program): GET `api.github.com` 200, POST `httpbin.org` 200, a valid
  certificate accepted, expired / wrong host / self-signed refused, the same answers as on the Mac. The first request takes 1.8 to
  3.9 s (the bundle is parsed and the handshake made on this CPU).
- Software screen, `nuxt-ui` while scrolling: 16 ms to draw a changed frame on one core and 19 to 25 ms for SDL to show it, 25 to 45
  frames a second, no vsync. This is why the GPU path matters here.
- A project whose Linux surface is larger than 1024x768 (`nuxt-ui`: 1100x900) needs `ZINC_SIZE=1024x768`: there is no `touchpad`
  profile yet.

Found on the way, not specific to the tablet:

- `fetch` fails on the Mac too for `https://api.github.com/zen` and `https://example.com/` (ECONNRESET) and `https://www.wikipedia.org/` (timeout).
- A failed `uv_loop_init` is not checked: the program then dies in `uv_run`.
- `nuxt-ui`, Components, "account": the options of the select open under the textarea (owner, to reproduce on the Mac).

Not done: an installable `.ipk` (launcher icon), the `touchpad` profile, the webOS services plugin (PDL, Luna bus), the system's
keyboard and orientation, the GL renderer (`ZINC_RENDERER=gl`) measured, and the shell in place of LunaSysMgr.

## 10. Performance: where the time goes and what is decided (2026-10-13)

Owner, 2026-10-13: the same smoothness as the native UI of webOS, at the full resolution, limits per device and a way to warn the developer.

Tools (all driven from the Mac): `ZINC_INPUT=<script>` (touches by frame; the GL backend keeps the script's pointer while no finger is on the
screen), `ZINC_FRAMES`, `ZINC_SHOT` (a BMP of the last frame, also the way to read `ZINC_PERF_HUD`), `ZINC_GL_STATS`, `strace -T` on the
tablet for the driver's ioctls, and PC samples of the main thread from `/proc/<pid>/stat` field 30, named with `llvm-symbolizer`.

Baseline, `examples/hero` without its video screen, 1024x768, frames a second over a whole scripted session:

| Session | software frame on 2 cores, shown by GLES | GL replay (`ZINC_RENDERER=gl`) |
|---|---|---|
| start screen (two full-screen radial gradients, a grid of 3000 dots, animated) | 8.5 (6.1 on one core) | 4 to 5 |
| Home, flicks | 19.5 | 16.6 |
| Gallery, flicks | 15.4 | 8.1 |
| Kit, flicks | 21.9 | not run |
| eight tab changes, twice | 12.6 | 8.3 |

- Software: 61% of the samples in `fill_rrect`, 13% `fill_poly`, 10% `shadow_rrect`; 113 ms for the start screen on one core. The rasterizer has no NEON code.
- GL replay: the CPU is idle (17%); one `IOCTL_KGSL_DEVICE_WAITTIMESTAMP` a frame lasts about 150 ms: the Adreno 220 needs that long for the
  per-pixel shaders. With every quad drawn as SOLID the run still makes 8.5 frames a second. No depth or stencil buffer, no occlusion pass,
  drawing straight to the window, client-side vertex arrays instead of a buffer filled per batch: no change. A quarter of the pixels: 7.1.
- The performance panel during a Gallery flick: frame 63.5 ms = `pnt` 16.8 ms (the UI records its 1811 commands again) + present 41.6 ms
  (raster and upload). Layout, input and the diff are under 1 ms each.

Why the native UI is smooth and this is not: it rasterizes content once into textures and then only composes them; Zinc records and
rasterizes every changed pixel again each frame (`lib/std/ui.ts` `paint`: a scroll re-emits every child at its new place, a transition
multiplies the alpha into every command; the damage of a 2 px scroll is the whole scroll area). The engine has no retained layer, but it has
the bricks: `gfx.beginImage` / `endImage` (a command range rasterized into a runtime image) and IMAGE, cheap in both renderers (a row copy,
one textured quad). `ui-rendering-architecture.md` proposes the same (`LayerPush cache_key`, retained layer tiles for T2/T3); D71 refused
offscreen subtrees for transforms because runtime images have no alpha.

Decision: a tile cache of scroll content in the UI library, as an accelerator with a fallback.
- The content of a scroll container is kept as 256 px tiles (runtime images, filled with the solid background behind the content; no solid
  background, a scale, a sticky child: no cache). A frame draws the tiles when every visible one is valid, else it paints as today and
  brings one tile up to date, so a content change never costs more than a frame of today.
- First validity rule: one global content epoch (any paint or layout dirtiness that is not a scroll or a tween). Per-node versions come after.
- Off by default; a device profile turns it on (`touchpad`: T2). Pixels with the cache off are unchanged.
- Then: the same for a screen in a transition, NEON in `fill_rrect` and `blend_row`, a frame budget per profile with a developer warning
  (the panel already counts `dropped`), and the profile itself.

## 11. What the GPU can do, and what held it back (2026-10-13, later)

A trial benchmark in the GL backend (120 frames, then `glFinish`; removed after the measure), 1024x768, a frame with its swap:

| Frame | Time |
|---|---|
| a clear and one flat quad over the screen | 2.2 ms |
| one textured quad (640x480, linear) over the screen, blended | 2.3 ms |
| three textured quads over each other, blended | 5.8 ms |
| depth test on, or blending on: no difference | 2.2 ms |

So the Adreno 220 and the swap of a webOS card are not the limit: a full-screen layer is about 2 ms. The same pixels through the GL replay's
programs took 16 ms (SOLID) and 32 ms (IMAGE): five `vec4` varyings, the raster's integer blend redone with `floor` per pixel, branches.
Its lean programs (`ZINC_GL_LEAN=1`, set by the webOS backend; `runtime/gl_replay_shaders.h`) draw a square quad of one colour, glyphs
and an image without rounded corners with two or three varyings and a plain premultiplied blend.

A sprite game written for the trial (a 640x480 background over the screen, rotated fruit pictures, a text line; typed Zinc, 12 commands
a frame; the pictures come from the owner's `fruit-ninja` folder and are not in the tree):

| Renderer | Frames a second (performance panel, steady) |
|---|---|
| software | 3.8 (269 ms in the raster: a scaled image and rotated ones) |
| GL replay, general programs | 37.3 (present 25.6 ms) |
| GL replay, lean programs | **59.7** (frame 16.73 ms: the screen's refresh; 5 frames dropped in 260) |

The application itself takes 0.4 ms a frame in both cases.

The tile cache of section 10 was written (`ZINC_UI_TILES=1`, `lib/std/ui.ts` `paintTiles`; `gfx.endImage` keeps an image whose cleared
command range is the one last drawn into it). As it is it makes `hero` slower (Kit 16.3 to 13.5 frames a second, Home 19.9 to 8.6): its
validity rule is one global epoch, `hero` keeps every screen mounted with live canvases, so every frame records the 20 visible tiles again.
It is off by default.

What follows from these numbers, in the order of the gain:
1. Lean variants for what a UI frame is made of: FILL without a gradient, BORDER and SHADOW are distance shaders over whole boxes; a box's
   inside is a flat quad and only its corners and edges need the distance (nine quads a box, or the corner texture the code already has).
   `hero`'s 150 ms of GPU is this.
2. The tile cache with a validity per scroll container (one recording of the content to know whether anything changed, then a version per
   node), drawn by the lean IMAGE program: a scroll becomes 20 textured quads.
3. The default renderer on this device: `gl` once 1 is done; today `cpu` is faster for a UI (19.5 against 16.6 on Home) and `gl` for sprites.
4. NEON in `fill_rrect` and `blend_row` for the software path, a `touchpad` profile (tier T2, the frame budget and the developer warning).

Also seen: Palm's SDL ignores `SDL_GL_SWAP_CONTROL` (the EGL swap interval works: `ZINC_VSYNC=0`); a glClear with nothing drawn costs
0.6 ms; a draw call costs 0.2 to 0.9 ms of CPU in this driver, a program change about 1 ms.

## 12. Lean box programs, square clips, the device's libm (2026-10-13, last)

`examples/hero` without its video screen, GL replay, frames a second over a whole scripted session (the method: `docs/targets/adapting-to-hardware.md`):

| Session | general programs | + lean SOLID, TEXT, IMAGE, FILL, BORDER, SHADOW and the device's libm | + square clips |
|---|---|---|---|
| start screen | 4.8 | 15.8 | 16.0 |
| Home, flicks | 16.6 | 30.5 | 31.0 |
| Kit, flicks | not run | 29.1 | 31.4 |
| Gallery, flicks | 8.1 | 10.3 | 27.9 |
| transitions between four light screens | not run | 12.0 | 24.1 |
| eight tab changes, twice (the map and the gallery among them) | 8.3 | 10.9 | 17.4 |

The software frame on two cores gives 19.5, 21.9, 17.3, 15.7 and 12.9 on the same sessions: the GL replay is now the faster renderer on this device.

- **Rounded clips** were the slow transitions: a CLIP with a radius copies its four corners from the framebuffer (`glCopyTexSubImage2D`) and
  blends them back at UNCLIP. The Adreno draws in tiles: each copy makes it draw the frame so far and load it back. The performance panel
  showed 77 ms of present for the 255 commands of the Settings screen. `ZINC_GL_CORNERS=0` (set by the webOS backend) makes every clip
  square; what a rounded container holds can then reach into its corners. The repair that keeps the corners: the clip in the stencil buffer.
- **Math without the FPU**: `sin`, `cos`, `tan`, `exp`, `exp2`, `log`, `sqrt`, `fmod` were zig's compiler-rt, built soft-float for the
  gnueabi ABI and taken before the device's libm (PC samples in `__aeabi_dmul`; `llvm-nm` shows them as local text symbols).
  `src/rt/alloc.cpp` now sends them to the device's libm. `floor`, `ceil` and `round` are still zig's (bit operations, no arithmetic).
- A capture of the Kit screen drawn by the lean programs matches the software frame (3.6% of the pixels differ, the animated counters and edges).

Left, in the order of the expected gain: fewer draw calls (95 to 150 a frame, 11 ms of CPU: a program change ends a batch and the lean
programs made more of them); the paint phase (the UI records every command again each frame, 10 to 17 ms); the stencil clip; the scroll
tiles with a validity per container; the polygon-heavy screens (the map: 9400 quads a frame).

## 13. Installed programs and a launcher (2026-10-13)

A Zinc program is a webOS application once its folder is in `/media/cryptofs/apps/usr/palm/applications/<id>/` with an `appinfo.json`
(`"type": "pdk"`, `main`, `id`, `icon`, `requiredMemory`; `"visible": false` keeps it out of the system's launcher) and the application
manager has scanned again (`palm://com.palm.applicationManager/rescan`). No `.ipk` is needed on a developer-mode tablet. The system
starts it in a jail (`/var/palm/jail/<id>`) with the application's folder as the working directory, so files beside the program are
found by their relative path.

- `plugins/webos` (`zinc:webos`): `isWebOS()`, `serviceCall(uri, params)`, `launch(appId)`, through the PDK's `libpdl.so` loaded with `dlopen`.
- `examples/webos-shell`: a grid of icons from `apps.txt` (id, title, icon file); a tap calls `launch`. Each program has its own card, and
  the tablet's home gesture brings the shell back.
- `tools/webos-apps <project>[=Title] ...`: builds the projects and the shell, makes the icons (the project's `icon.png`, else a
  picture of its first second on the workstation), installs everything over novacom and writes the shell's list.
- A build for `armv7-webos` now takes the GL display and the screen's own size unless `zinc.json` has a `webos` target; the backend
  sets the GL renderer, the lean programs and square clips.

Installed with it: Fruits, Hero (without its video screen), Nuxt UI, Keyboard, and the shell as "Zinc". Checked from the workstation: the
five folders, the rescan, the shell started by the application manager and running in its jail. Not checked by eye: the grid on the
screen and a tap starting a program.

## 14. A wall remote: the screen off, Sonos, Spotify, and a TLS 1.3 fault (2026-10-15)

`examples/music` (owner's request): a Sonos remote that never quits, on the charger. What it needed from the tablet and the engine:

- **The screen.** Measured: the backlight is `/sys/class/leds/lcd-backlight/brightness` (0..255, root only; 92 at the owner's setting);
  `com.palm.display/control/getProperty` answers `maximumBrightness` 100, `timeout` 120, `onWhenConnected` false; `setProperty
  {"maximumBrightness":0}` as root takes the LED to 3, not 0. The open sources say the system's display "off" turns the touch panel off
  too, and `com.palm.display/control` is on the private bus only (docs/reports/hardware/webos-screen-power.md). So: the program calls
  `PDL_ScreenTimeoutEnable(false)` (new: `screenTimeout()` in zinc:webos) and writes `off`/`on` into a file under /tmp (now `setBacklight` of zinc:webos, /tmp/zinc/backlight), which a PDK
  jail shares with the system (`mount rw /tmp` in `/etc/jail_pdk.conf`); a root upstart job (now zinc-helper, below) copies it to
  the LED and lights it again when the program is gone. The application folder is the jail's `$HOME` and writable.
- **Exhibition mode** (the Touchstone's clock): an `appinfo.json` `"dockMode": true`, but the sources show the dock window manager hosts
  web-app windows only; not tried for a PDK program.
- **TLS 1.3.** `fetch` to `api.spotify.com` and `upload.wikimedia.org` failed with ECONNRESET on the Mac (the `example.com` failure of
  section 9 too). mbedTLS 4.0's debug output: the TLS 1.3 handshake completes, the request goes out (one record), the server sends two
  NewSessionTickets and closes, with no alert. OpenSSL's TLS 1.3 with the same request gets the answer; mbedTLS capped at TLS 1.2 too.
  Record padding is not the cause (granularity 1 tried). Root cause not found; `src/host/http.cpp` now makes the request again once
  over TLS 1.2 when a TLS 1.3 session is closed after the request with no byte of answer (`tls::openClient(..., tls12)`). Verified: the
  five hosts answer; `t0/tls` and `t1/plugin_fetch` pass.
- **Spotify and Sonos.** Spotify lists the owner's Sonos group as the active device but `is_restricted` and absent from `/me/player/devices`:
  the Web API takes no command for it. Spotify content is therefore started through the speakers' Spotify service (service id 9 here,
  `x-rincon-cpcontainer:1006206cspotify%3aplaylist%3a...?sid=9&flags=8300&sn=N` queued, as the Sonos app does; zinc:sonos `playSpotify`).
  The account number `sn` was not found on the speakers (no favorites, empty queue, `/status/accounts` empty on S2): the program tries the
  first numbers and keeps the one that plays.
- **The status-bar strip.** Every Zinc program showed the wallpaper in its top 13 px: LunaSysMgr kept the card as a normal one, laid out
  under its 28 px status bar (docs/reports/hardware/webos-fullscreen.md). `plugins/display-gl/src/webos.cpp` now calls `PDL_Init(0)`
  before `SDL_Init`, as the PDK's own ports do, and asks `SDL_SetVideoMode(0, 0, 0, SDL_OPENGL | SDL_FULLSCREEN)`: the card is full
  screen (captured). Which of the two did it was not separated.
- **The CPU governor: the lag.** `ondemandtcl` holds cpu0 at 192 MHz (most of `time_in_state`), samples the load every 200 ms
  (`sampling_rate`), keeps cpu1 offline, and a touch lifts the clock to 1.188 GHz for 3 s (`max_tickle_window`). So a burst of work
  (a page drawn for the first time: 50 to 70 ms at full speed) stalls for hundreds of ms, and an animation runs at 30 to 40 frames a
  second until a finger touches the screen (the owner's observation on the fruit demo). Measured with both cores at `performance`
  (zinc-helper while the app shows, below): a 300 px cover decodes in 0 to 5 ms instead of 15 to 40. The GPU's clock has no knob
  in this kernel (`/sys/devices/platform/kgsl/msm_kgsl` holds only `io_fraction`).
- **zinc-helper.** What a jailed program may not do is served by one root job, `plugins/webos/helper.sh` (installed by
  `tools/webos-helper`, called by `webos-apps` and `examples/music/install.sh`): `setPerformance`, `setBacklight`, `openPort` of
  zinc:webos write request files into /tmp/zinc holding the program's pid, and the helper drops them when the process is gone. It writes
  the system's zone to /tmp/zinc/tz and the GL display sets `TZ` from it (a jail has no /etc/localtime; the clock read UTC).
- **Other facts.** An application has no right to `com.palm.firewall` (PDL_SetFirewallPortStatus fails: "does not have sufficient
  outbound permissions"): zinc-helper adds the iptables rules. A program started by hand from novacom inside an application's folder registers as that application: LunaSysMgr then sends
  every launch to its dead card (`processId` unchanged) until `stop LunaSysMgr; start LunaSysMgr`.

## Sources

Read by two research agents on 2026-10-13; pages they could not open are marked.

1. https://github.com/openwebos/luna-sysmgr
2. https://sdk.webosarchive.org/docs/dev-guide/pdk/linking.html ; https://lwn.net/Articles/471913/ (LunaSysMgr as compositor)
3. https://sdk.webosarchive.org/docs/dev-guide/pdk/building-for-the-device.html
4. https://github.com/openwebos/luna-service2
5. https://github.com/openwebos/powerd
6. https://sdk.webosarchive.org/docs/reference/pdk/plug-in-api-summary.html
7. https://sdk.webosarchive.org/docs/dev-guide/pdk/creating-an-application-package.html ; https://www.cnx-software.com/2012/07/01/webos-community-edition-release-for-hp-touchpad/
9. https://www.simplehelp.net/2012/02/04/how-to-enable-developer-mode-on-your-hp-touchpad/
10. https://sdk.webosarchive.org/docs/dev-guide/tools/enabling-developer-mode.html
11. https://docs.webosarchive.org/macos-install/ ; https://github.com/flto/linux/issues/7 (touch chain, mainline status)
12. https://forums.weboslives.eu/d/78-quick-and-dirty-instructions-for-novacom-on-macos-sequoia ; https://liliputing.com/how-to-install-ubuntu-linux-on-an-hp-touchpad/
14. https://github.com/freedreno/freedreno/wiki/HP-TouchPad
15. https://docs.webosarchive.org/activate/ (not opened: 404) ; https://www.webosarchive.org/pivot/2014/06/13/webos-ports-surprises-with-touchpad-port-namelogo-change/
16. https://www.webosarchive.org/pivot/2015/06/24/tip-how-to-bypass-activation/ ; https://www.xda-developers.com/luneos-webos-android/
18. https://gitlab.postmarketos.org/postmarketOS/pmaports/-/merge_requests/2791
19. https://wiki.postmarketos.org/wiki/HP_TouchPad_(hp-tenderloin)
20. https://wiki.mobileread.com/wiki/HP_TouchPad
21. https://sdk.webosarchive.org/docs/reference/services/display-manager.html
22. https://hroy.eu/tips/webos-touchpad-restore/
23. https://docs.webosarchive.org/startover/
