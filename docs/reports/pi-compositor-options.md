# A compositor on the Zinc Pi image: what exists and what each Pi can do

Research for the owner's request (2026-10-25): a light, fast compositor on the Zinc Raspberry Pi image, for Pi 1, Pi Zero
and Zero 2 W, Pi 3, Pi 4 and Pi 5, that can be switched off (then today's direct path stays). This report covers the
outside world: the display hardware of each Pi, the existing compositors and in-app composition models, and a scored
recommendation. How a compositor fits inside Zinc is studied separately.

Tags: **[S]** sourced (link or file given), **[R]** measured or written in this repository, **[I]** inference (mine, not
stated by a source). Kernel facts come from the mainline `drivers/gpu/drm/vc4/` and the Raspberry Pi `rpi-6.12.y` tree,
read on 2026-10-25.

## Summary

1. **The Pi already has a hardware compositor: the HVS.** On every Pi with full KMS (Pi 0/1 with 512 MB, Pi 2, 3, Zero 2 W,
   4, and the HDMI outputs of the Pi 5) it composes up to 16 overlay planes, a primary and a cursor, with per-pixel alpha,
   scaling and YUV conversion, at no GPU or CPU cost. The Pi 1 and Zero have the same HVS as the Pi 3. Zinc already uses it
   for video (ZN-731: 37 ms of CPU per picture down to 3.5 ms) [R].
2. **What the HVS cannot do:** rotate by 90 or 270 degrees (only 0, 180 and mirroring), apply blur, shadow, a transform or
   rounded clipping. Those layers have to be pre-composed by the GPU or the CPU. The kernel also refuses a commit over a
   memory-bus and HVS-cycle budget on the Pi 0 to 3: at 1080p60 that is about three full-screen ARGB layers [S].
3. **The Pi 5's DSI, DPI and composite outputs have no planes.** They are RP1 "simple display pipes": one RGB plane, no
   scaling, no YUV, no cursor plane [S]. There every layer must be composed by the GPU (V3D 7.1 is fast enough) or the CPU.
4. **wlroots compositors (cage, labwc, sway) use only the primary and cursor planes.** The scene graph either scans out one
   fullscreen buffer directly or draws everything with GLES 2 [S]. Weston is the only off-the-shelf compositor that places
   several surfaces on overlay planes [S]. Android's HWComposer, flutter-pi and gamescope with libliftoff follow the
   "planes first, GPU for the rest" model [S].
5. **On the Pi 1 and Zero,** Raspberry Pi OS runs labwc as its default desktop on all models and says it is "just as fast as
   X on older Raspberry Pi models" [S]. That claim comes from the vendor. I found no published frame time, CPU or RAM
   measurement of any Wayland compositor on an ARMv6 Pi. The single 1 GHz ARM11 core limits it, not the GPU [I].
   A planes-only design needs no GPU work per frame there. Pi 1 boards with 256 MB cannot load full KMS at all [S].
6. **Recommendation (score 62/70):** composition inside Zinc, planes first, in the style of HWComposer. Each layer (the app,
   the dev bar and perf panel, video, the cursor, later a second app) goes on an HVS plane. Layers the planes cannot take
   are flattened into one plane, by GLES on the Pi 2 and later and by the CPU raster on the Pi 0 and 1. Plane allocation
   uses libliftoff (MIT) or a minimal own allocator. Off, it is today's path. **cage** (MIT, 55/70) is an optional outer
   compositor for programs that are not Zinc (a browser, X11 apps) on Pi 3 and later with 1 GB or more. It is not the
   compositor for Zinc's own layers.

## 1. The hardware

### 1.1 Boards

| Board | SoC, CPU | RAM | 3D GPU | Display controller | GL |
|---|---|---|---|---|---|
| Pi 1 A/B/A+/B+, Zero, Zero W | BCM2835, 1 x ARM1176 (ARMv6) 700 MHz to 1 GHz | 256 or 512 MB | VC4 (VideoCore IV 3D) | HVS (gen 4) + 3 pixel valves | GLES 2.0 (Mesa vc4) |
| Pi 2 | BCM2836/7, 4 x Cortex-A7/A53 | 1 GB | VC4 | HVS gen 4 | GLES 2.0 |
| Pi 3 B/B+, 3 A+ | BCM2837(B0), 4 x A53 1.2-1.4 GHz | 1 GB (3A+: 512 MB) | VC4 | HVS gen 4 | GLES 2.0 |
| Zero 2 W | RP3A0 (BCM2710A1), 4 x A53 1 GHz | 512 MB | VC4 | HVS gen 4 | GLES 2.0 |
| Pi 4 / 400 / CM4 | BCM2711, 4 x A72 1.5-1.8 GHz | 1-8 GB | V3D 4.2 | HVS gen 5 | GLES 3.1, Vulkan (v3dv) |
| Pi 5 / CM5 | BCM2712, 4 x A76 2.4 GHz + RP1 | 2-16 GB | V3D 7.1 | HVS gen 6 (HDMI); RP1 DSI/DPI/VEC (one plane) | GLES 3.1, Vulkan (v3dv) |

Sources: Pi 4 GLES 3.1 conformance (Igalia, https://blogs.igalia.com/itoral/2020/01); Mesa vc4/v3d
(https://www.raspberrypi.com/news/vc4-and-v3d-opengl-drivers-for-raspberry-pi-an-update/); the VC4 architecture
notes already gathered in `docs/reports/hardware/vc4-gles2-performance.md` [R].

### 1.2 Firmware KMS against full KMS

- `vc4-fkms-v3d` ("fake" or firmware KMS) drove the screen through the firmware's DispmanX. It is deprecated, and the
  image uses full KMS, `dtoverlay=vc4-kms-v3d`, where the kernel programs the HVS itself and exposes real planes [S]
  (https://forum.manjaro.org/t/rpi-4-vca-kms-v3d-or-vca-fkms-v3d/115254 ; overlay README below). Everything below assumes
  full KMS.
- **256 MB boards cannot use it:** "The firmware will not allow this overlay to load on a Pi with less than 512MB as memory
  is too tight" [S] (https://github.com/raspberrypi/firmware/blob/master/boot/overlays/README, entry `vc4-kms-v3d`). On a
  Pi 1 Model A, an early Model B or an early A+ (256 MB) the only screen is the firmware framebuffer: `display-fbdev`'s
  plain path, with no planes and no compositor.
- **CMA:** the overlay reserves 256 MB of contiguous memory by default ("should be kept as is for backwards compatibility",
  `arch/arm/boot/dts/overlays/cma-overlay.dts`), which is half of a Zero's RAM. The README marks `cma-192` and up as "needs
  1GB". One report has a 512 MB 3A+ failing to boot out of memory with the KMS overlay, while a Zero 2 W boots, and
  `cma-128` cures it (https://launchpad.net/bugs/2060300) [S]. Every compositor buffer (scanout and GPU) comes from CMA:
  800x480 ARGB is 1.5 MB and 1920x1080 is 8.3 MB, double-buffered per layer [I, arithmetic]. On 512 MB boards the image
  should set `cma-128` or `cma-96` explicitly and keep the layer count small.

### 1.3 The HVS: what it composes for free (Pi 0 to 4, Pi 5 HDMI)

From `drivers/gpu/drm/vc4/vc4_plane.c`, `vc4_hvs.c` and `vc4_kms.c` (mainline) [S]:

| Property | Value | Where |
|---|---|---|
| Planes exposed | 1 primary + **16 overlay** + 1 cursor per CRTC, all with a `zpos` property | `VC4_NUM_OVERLAY_PLANES 16`. The comment says the hardware limit is the display-list RAM, not registers. The Pi 3B+ showed "16 free overlay planes" on its CRTC [R] (`docs/reports/raspberry-pi.md`, ZN-731) |
| Display-list memory | 16 KB shared by every output (minus 32 words kept by the bootloader); a plane takes at least 28 bytes, more when scaled | `SCALER_DLIST_SIZE 0x4000`, `vc4_hvs.c` |
| Line-buffer memory (scaled planes) | gen 4: 48 K words of 2x12-bit pixels; gen 5: 60 K words of 4x12-bit | `vc4_hvs.c`; allocated globally, not reused between planes |
| Throughput | "2 pixels/cycle when scaling the source, 4 pixels/cycle otherwise"; alpha blending is pipelined at 4 px/cycle | `vc4_plane_calc_load` |
| Admission (gen 4: Pi 0-3) | commit refused (`-ENOSPC`) above **1.5 GB/s** of memory reads ("absolute limit is 2Gbyte/sec") or **240 M HVS cycles/s** (clock 250 MHz) | `vc4_load_tracker_atomic_check` |
| Admission (Pi 4, Pi 5) | load tracker not enforced on BCM2711 and later; the numbers only set the core clock | `vc4_kms.c` comment |
| Alpha | per-pixel alpha (premultiplied or not) and a per-plane alpha property | `vc4_hvs4/5_get_alpha_blend_mode` |
| Formats | RGB 16/24/32 with and without alpha, YUV 4:2:0 / 4:2:2 planar and semi-planar (NV12, YU12), SAND tiled (Pi 4/5 decoder) | `hvs_formats[]`. ZN-731 used `YU12` and `AR24` on overlays [R] |
| Rotation | **0, 180, mirror X, mirror Y only.** No 90/270 | `drm_plane_create_rotation_property(... ROTATE_0 / ROTATE_180 / REFLECT_X / REFLECT_Y)` |
| Scaling | up and down, per plane, with filters (also chroma) | `vc4_plane.c` scaling code |

What this means for 60 Hz on a Pi 0 to 3 [I, from the kernel formulas]:

| Mode | One unscaled ARGB layer: memory, HVS cycles | Full-screen ARGB layers that fit the budget |
|---|---|---|
| 800x480 (Pi 7" panel) | 92 MB/s, 5.8 M cycles | all 16 planes |
| 1280x720 | 221 MB/s, 13.8 M | about 6 |
| 1920x1080 | 498 MB/s, 31 M | about 3 (memory bound); a 1080p NV12 video plane costs 187 MB/s |

Small layers (a dev bar 40 px tall, a cursor, a perf panel) cost almost nothing: the load counts only the pixels of each
plane. The budget is shared with the CPU and the 3D core on the same LPDDR2 bus. On a Pi Zero a GPU pass that reads and
writes a full-screen buffer competes with the HVS [I].

### 1.4 What costs GPU time

- VC4 is a tile renderer: 64x64 tiles, every vertex shaded twice (bin and render), blending done in the fragment shader
  ("The QPUs perform all colour blends in software"), and a full-screen pass that loads the previous contents costs a tile
  load per tile [S, cited in `docs/reports/hardware/vc4-gles2-performance.md`] [R].
- A GLES compositor that redraws N full-screen blended layers pays N full-screen blended passes. The Pi 1, Zero and Pi 3
  share the same 3D core (250 MHz on the BCM2835, 300 to 400 MHz on later chips). The difference is the CPU that drives
  Mesa: one ARM11 core against four A53 cores [I].
- Repository measurement: hero's Navigation screen costs 184 ms per frame on the Pi 3B+ GPU, so GLES is not a free path on
  VC4 for heavy UI [R] (`docs/reports/raspberry-pi.md`).
- V3D 4.2 (Pi 4, 500 MHz) and V3D 7.1 (Pi 5, 800 MHz) are several times faster. A GLES composition pass of a few layers
  at 1080p is cheap there [I].

### 1.5 The Pi 5: two display paths

- **HDMI** goes through the BCM2712's HVS (vc4 driver, `VC4_GEN_6_C`/`_D`), with the same planes, alpha and scaling. Its
  display-list size is read from a register (`SCALER6_CXM_SIZE`) [S].
- **DSI, DPI and composite** sit on the RP1 chip. Their kernel drivers (`drivers/gpu/drm/rp1/rp1-dsi`, `rp1-dpi`, `rp1-vec`
  in `raspberrypi/linux rpi-6.12.y`) are `drm_simple_display_pipe`: **one plane**, formats XRGB/ARGB/RGB888/RGB565 only,
  no YUV, no scaling, no cursor plane [S]. A Pi 5 with the Touch Display 2 on DSI composes everything on the GPU or the
  CPU. Video there needs a GPU blit (dmabuf import into GLES) [I].

### 1.6 CPU and RAM budget on a Pi Zero / Pi 1

- One ARM1176 core at 1 GHz (700 MHz on a Pi 1), ARMv6 with VFP, no NEON, 512 MB shared with the GPU and CMA [S, board
  specs]. After 256 MB of CMA, about 200 MB is left for Linux, the session and the app [I].
- What the repository measured on the Pi 3B+ shows the scale. The CPU raster of a settings UI is 15 to 19 ms at 800x480
  on 4 cores [R] (`docs/reports/pi-os/01-zinc-inventory.md`). The same work on one ARM11 core is several times slower [I].
  A design that recomposes every frame on the CPU, or that copies buffers between processes, does not fit there. A
  design where only damaged layers are redrawn and the HVS blends does fit.

## 2. Candidates

Columns: **Pi 0/1**: runs on ARMv6 with VC4 and 512 MB; **Idle**: RAM and CPU at idle; **Latency**: frames added between a
client's buffer and the screen; **Off**: how it is switched off on our image; **Overlays**: how it puts layers on screen.

### 2.1 Wayland compositors

| Candidate | Licence | Pi 0/1 | Idle (RAM, CPU) | Latency | X11 / Wayland clients | Input | Rotation | Overlays (planes) | Off |
|---|---|---|---|---|---|---|---|---|---|
| **cage** (kiosk, wlroots) | MIT | packaged for armhf in Pi OS bookworm and trixie (0.2.0-2+rpt1) [S]; speed on a Zero not measured | not published; one small process plus wlroots, libinput, xkbcommon, optional Xwayland [I: a few MB to tens of MB PSS] | 0 extra with direct scanout ("only when a single surface is shown with no subsurfaces, popups"), otherwise one GLES pass, about +1 frame [S/I] | Wayland; X11 through Xwayland (optional build) | libinput (touch, keyboard, pointer), xkb layouts by env | via wlr-output-management (wlr-randr); 90 degrees means a GLES pass every frame | primary (direct scanout) + cursor only | do not start the unit; needs logind or seatd (`PAMName=`) [R: `pi-os/07`] |
| **labwc** (stacking, Openbox-like) | GPL-2.0-only | Raspberry Pi OS desktop default "across all models" since 2024-10 [S] | Pi OS claims "just as fast as X on older models"; Simon Long: "very slightly slower than Bullseye on Pi 3 and below" [S] | same as cage | Wayland + Xwayland (Xwayland slow on a Pi 3B+ in an LWN report) [S] | libinput | wlr-randr / kanshi | same as cage | do not start it |
| **wayfire** | MIT | dropped by Raspberry Pi: "still didn't run well enough on older Pis", and its direction moved away from Pi hardware [S] | heavier (3D effects, plugins) | same + effects | Wayland + Xwayland | libinput | yes | wlroots | n/a |
| **sway** (minimal config) | MIT | builds for armhf; tiling desktop | a user reports 189 MB RSS for a session, mostly shared libs [S] (anecdotal) | wlroots | Wayland + Xwayland | libinput | `output transform` | wlroots | do not start it |
| **tinywl** | MIT (wlroots example) | builds | smallest wlroots compositor | wlroots | Wayland only | basic | none | wlroots | example code, not a product |
| **hikari** | BSD-2 | old wlroots, no longer active [I] | small | | | | | | rejected (unmaintained) |
| **Weston + kiosk-shell** | MIT | builds for armhf; the old DispmanX backend for the Pi was removed; the DRM backend works on vc4 [S/I] | small: 9 MB measured in 2013 [S, Phoronix]. The README's warning about "severely memory-constrained environments" is about `malloc` failure handling, not size [S] | 0 with a plane, else a GL or pixman pass | Wayland + Xwayland | libinput, touch calibration | `transform=` in weston.ini | **assigns surfaces to overlay and underlay planes** (`backend-drm/state-propose.c`); falls back to GL or pixman [S] | do not start it; needs logind or seatd |
| **Mutter / KWin** | GPL | not practical on 512 MB ARMv6 | 100+ MB with their shells [I] | | | | | direct scanout, some overlay work | rejected: too heavy |
| **niri, cosmic-comp** (smithay) | GPL-3.0 | Rust builds for ARMv6, but these are desktop compositors and no Pi 0 data exists. smithay's GLES renderer accepts GLES 2.0 + `GL_EXT_texture_format_BGRA8888` (so VC4 works), with an instancing fast path only on GLES 3 [S] | desktop class | | Wayland, Xwayland via satellite | libinput | yes | mostly primary/direct scanout | rejected for fit and licence |
| **kmscon** | MIT/ISC (sources differ) | yes | tiny | n/a | a terminal on KMS, not a compositor; revived in 2025, a Fedora default proposal [S] | keyboard | | none | not a candidate; possible later console |

wlroots plane use [S]: `types/scene/wlr_scene.c` tries **direct scanout** of a single eligible buffer
(`WLR_SCENE_DISABLE_DIRECT_SCANOUT` turns it off). The DRM backend can be built with libliftoff (`backend/drm/libliftoff.c`,
meson option `libliftoff`), but the scene graph does not place several surfaces on overlay planes. In practice a wlroots
kiosk on a Pi uses one plane for the app (when it alone is shown), one for the cursor, and GLES 2 for everything else.
wlroots also has a CPU renderer (pixman, `WLR_RENDERER=pixman`), with no published performance data on ARM [S].

### 2.2 Composition inside the runtime (the model, not a product to install)

| Model | Licence | What it does | Lesson for Zinc |
|---|---|---|---|
| **Android SurfaceFlinger + HWComposer** | Apache-2.0 | SurfaceFlinger hands every layer to the HWC, which marks each one *device* (overlay plane) or *client* (GLES). Client layers are composed into one buffer that takes one more plane. Devices "typically support four overlay planes"; past that, layers fall back to GLES. When the screen is idle the HWC may compose once and keep the result for battery [S] (https://source.android.com/docs/core/graphics/hwc). On DRM boards `drm_hwcomposer` does the same with atomic commits and staged planners [S] | the exact design to copy: a layer list, a TEST_ONLY probe, GPU or CPU for the rest |
| **gamescope + libliftoff** | BSD-2 / MIT | libliftoff takes "layers" and picks hardware planes for them through atomic TEST_ONLY commits, needs universal planes and atomic, depends only on libdrm. Used in production by gamescope on the Steam Deck [S] (https://gitlab.freedesktop.org/emersion/libliftoff) | a proven, small (MIT) plane allocator we can vendor |
| **flutter-pi** | MIT | a Flutter embedder straight on DRM/GBM. Its compositor "takes flutter layers as input, composits them into multiple hw planes" (platform views such as video on their own plane), and `--rotation` [S] (`src/compositor_ng.c`, README) | the same approach as ours (an app runtime on KMS), proven on Pi 2/3/4/Zero 2. It does **not** run on the Pi Zero or Pi 1 (ARMv7 and up) [S] |
| **Qt EGLFS / QtWayland compositor on eglfs** | LGPL-3 / GPL-3 / commercial | EGLFS: one fullscreen app on KMS, no compositor. The QtWayland compositor (QML) on eglfs hosts other clients through Qt Quick, so GLES composition every frame. Reports from a Pi 2 and 3 show Wayland clients slower than EGLFS [S] (forum.qt.io topics 80698, 305663) | confirms that an app on KMS beats an app under a compositor on VC4. Qt's footprint and licence do not fit |
| **GPUI (Zed)** | Apache-2.0 | the app draws all its layers itself in one GPU pass (blade, Vulkan) and is a plain client of the system compositor [I] | in-app composition by the renderer, which Zinc already does. Vulkan is not available on VC4 |

## 3. Can a Pi Zero or Pi 1 run a Wayland compositor at usable speed?

- **Evidence that it runs:** Raspberry Pi OS makes labwc the default desktop "across all models" and the 32-bit image
  still targets ARMv6 (Pi 1, Zero) [S] (https://www.raspberrypi.com/news/a-new-release-of-raspberry-pi-os/ ; Wikipedia,
  Raspberry Pi OS). cage is packaged for armhf by Raspberry Pi [S].
- **Evidence on speed:** only the vendor's words ("just as fast as X on older Raspberry Pi models"; "very slightly slower
  than Bullseye on Pi 3 and below") [S]. Users report Xwayland slow on a Pi 3B+ (LWN, https://lwn.net/Articles/996332).
  Raspberry Pi's own kiosk tutorial asks for a Pi 3 or newer with 1 GB or more (for Chromium) [S, `pi-os/06`]. Raspberry
  Pi Connect forces X11 on Pi Zeros [S] (dev.to article). **I found no frame time, CPU or PSS measurement of cage,
  labwc or Weston on a Pi Zero or Pi 1.** One has to be taken on the device before any decision that depends on it.
- **Reasoning [I]:** a desktop of mostly static windows is fine because the compositor draws only on damage. A
  fullscreen app animating at 60 Hz under a compositor costs the app's render, a buffer handoff across processes and,
  without direct scanout, one more GLES pass, all driven by the single ARM11 core through Mesa. With direct scanout of a
  single fullscreen client (cage's best case) the extra cost is small, but then the compositor adds nothing Zinc does not
  already have.
- **"No GPU composition, planes only" on a Pi 0/1:** the HVS is the same as the Pi 3's, so it does the same work at the
  same cost: 16 overlay planes, alpha, scaling, YUV video (ZN-731 proved video on a plane at 3.5 to 4.8 ms CPU per
  picture on the Pi 3B+, at half clock [R]). What it gives there:
  - the app's frame, the dev bar, the perf panel, a toast or keyboard, the cursor and video each on their own plane,
    redrawn only when they change, with no blend pass by any processor;
  - moving or fading a layer costs one atomic commit (0.15 ms measured [R]), not a redraw;
  - a 720p app scaled to a 1080p screen by the HVS (the idea in `pi-1080p.md`) [R];
  - limits: 16 planes, the 1.5 GB/s and 240 M cycles/s budget, no 90 degree rotation, no effects. A layer that breaks a
    rule is flattened into its neighbour by the CPU raster on damage only (the "client composition" of HWC).
  - Rotation for a portrait panel on a Pi 0/1: Zinc draws its own pixels, so the engine can render directly in the
    rotated orientation. That costs nothing per frame, while a compositor rotates with a GPU pass on every frame [I].

## 4. Scored options (RULES.md §4)

Weights: fit x3, performance x3, size x2, maintainability x2, licence and supply x2, portability x1, effort x1 (max 70).

| Option | Fit | Perf | Size | Maint. | Licence | Port. | Effort | **Total** |
|---|---|---|---|---|---|---|---|---|
| **A. Planes-first composition inside Zinc** (HWC model: KMS atomic, libliftoff or a minimal allocator, GLES fallback on Pi 2+, CPU raster fallback on Pi 0/1; off = today's path) | 5 | 5 | 5 | 3 | 5 | 4 | 2 | **62** |
| B. cage as an optional outer compositor (Zinc a Wayland client) | 3 | 4 | 4 | 4 | 5 | 4 | 4 | 55 |
| C. Weston kiosk-shell | 3 | 4 | 3 | 3 | 5 | 4 | 3 | 50 |
| D. labwc | 2 | 3 | 3 | 4 | 4 | 4 | 4 | 45 |
| E. Qt Wayland compositor on eglfs | 2 | 3 | 1 | 3 | 2 | 3 | 2 | 32 |
| F. niri / cosmic-comp (smithay) | 1 | 2 | 2 | 2 | 2 | 2 | 2 | 25 |
| G. wayfire / Mutter / KWin | 1 | 1 | 1 | 2 | 3 | 2 | 3 | 23 |

Notes on the scores:
- A scores high on fit because it serves the owner's goal (modest machines, Pi 1 included, the engine's own overlays)
  and keeps one process owning the screen, which is how the image already works. Maintainability is 3 because it is code
  we own. Effort is 2 because plane allocation, fallback flattening and the RP1 path are new work. Portability is 4: KMS
  planes exist on most Linux boards, and every target keeps the composition by the renderer as a fallback.
- B, C and D are separate processes speaking Wayland. They help only when programs that are not Zinc must share the
  screen. B beats C on maintenance (a single-purpose kiosk, already in rpi-image-gen's `webkiosk` example [R:
  `pi-os/06`]); C beats B on planes. All three need libseat/logind and libinput, a new boot dependency (the image runs
  without PAM today [R: `pi-os/07`]).
- libliftoff (MIT, libdrm only, proven on the Steam Deck) fits RULES.md §3 "proven libraries first" for the plane
  allocator inside A. Today `display-fbdev` reaches KMS with raw ioctls and no libdrm. Taking libliftoff means adding
  libdrm to that path; `display-gl` already links it [R]. With fewer than about four layers a minimal allocator (fixed
  zpos, a TEST_ONLY commit, flatten on refusal) is enough. Switch to libliftoff when layer counts grow [I].

## 5. Recommendation and fallback per generation

**Choice: A.** Composition inside Zinc, planes first: a layer list per output, each layer on an HVS plane when an atomic
TEST_ONLY commit accepts it, the rest flattened into one plane. Switched off by one key (an environment variable or a
profile option), which gives exactly today's direct path. **Add B (cage) only** when a program that is not Zinc (a
browser, an X11 tool) must be shown, as a separate session unit on Pi 3 and later with 1 GB or more. Zinc then runs as a
Wayland client and the in-Zinc composition stays off. To revisit if a measurement on a Pi Zero shows cage at under 5% CPU
idle and direct scanout at 60 Hz for a fullscreen Zinc client, which would make B usable there too. Also revisit if the
other agent's study finds that planes cannot be shared between Zinc processes without a broker.

| Generation | Display path | Composition | Fallback for layers the planes refuse | Outer compositor for programs that are not Zinc |
|---|---|---|---|---|
| Pi 1 / A+ with 256 MB | firmware fb only (no full KMS) [S] | none: the engine draws its overlays into its frame (today) | n/a | no |
| Pi 1, Zero, Zero W (512 MB, ARMv6) | full KMS, `cma-128` or less | **planes only**: app, overlays, cursor, video on HVS planes | CPU raster on damage into one plane; render rotated in the engine for portrait panels | no (unmeasured, CPU-bound [I]) |
| Pi 2, Pi 3, Zero 2 W (VC4, GLES 2) | full KMS | planes first | GLES 2 pass for the refused layers (transforms, 90 degrees), or the CPU raster when cheaper; keep it to damage | cage, on 1 GB boards only |
| Pi 4 (V3D 4.2, HVS gen 5) | full KMS (HDMI, DSI) | planes first (no kernel budget enforced, watch underruns at 4K) | GLES 3.1 pass | cage (or labwc for a desktop) |
| Pi 5 HDMI (V3D 7.1, HVS gen 6) | full KMS | planes first | GLES 3.1 pass | cage |
| Pi 5 DSI / DPI / composite (RP1) | one plane, RGB only [S] | **GPU composition always** (one GLES pass of the layer list) | CPU raster if no GPU; software cursor; video via dmabuf import into GLES | cage (composes with GLES there anyway) |

What to measure first, on the Pi 3B+ the repository already uses and on a Pi Zero when one is on the bench: (1) the CPU,
PSS and frame time of cage with one fullscreen Zinc client, with and without direct scanout; (2) the commit time and the
underrun-free limit of N overlay planes at 1080p60 on VC4, checked against the kernel's 1.5 GB/s budget; (3) the CPU
raster flattening cost of a 40 px dev bar on a Pi Zero.

## Sources

- Raspberry Pi, "A new release of Raspberry Pi OS" (labwc on all models, why not wayfire, staff comments): https://www.raspberrypi.com/news/a-new-release-of-raspberry-pi-os/
- LWN comments on labwc and Xwayland on a Pi 3B+: https://lwn.net/Articles/996332
- Linux kernel vc4 driver: https://docs.kernel.org/gpu/vc4.html ; sources `drivers/gpu/drm/vc4/vc4_plane.c`, `vc4_hvs.c`, `vc4_kms.c`, `vc4_regs.h`: https://github.com/torvalds/linux/tree/master/drivers/gpu/drm/vc4
- Raspberry Pi kernel RP1 display drivers (`rp1-dsi`, `rp1-dpi`, `rp1-vec`): https://github.com/raspberrypi/linux/tree/rpi-6.12.y/drivers/gpu/drm/rp1
- RP1 datasheet summary (two DSI, DPI on RP1): https://www.cnx-software.com/2023/10/07/raspberry-pi-rp1-datasheet-block-diagram/
- Overlay README (`vc4-kms-v3d` 512 MB minimum, CMA options): https://github.com/raspberrypi/firmware/blob/master/boot/overlays/README ; CMA default: https://github.com/raspberrypi/linux/blob/rpi-6.12.y/arch/arm/boot/dts/overlays/cma-overlay.dts
- KMS overlay OOM on a 512 MB 3A+: https://launchpad.net/bugs/2060300
- Anholt, vc4/vc5 at XDC 2017 (HVS planes are display-list entries in RAM): https://wiki.freedesktop.org/xorg/Events/XDC2017/anholt_vc4_vc5.pdf
- fkms deprecated: https://forum.manjaro.org/t/rpi-4-vca-kms-v3d-or-vca-fkms-v3d/115254
- cage: https://github.com/cage-kiosk/cage (man page `cage.1.scd`, releases); direct scanout: https://www.phoronix.com/news/Cage-0.1.2-Wayland-Released ; Pi OS package: https://aptpeek.dev/raspberrypi/trixie/main/armhf/cage/0.2.0-2+rpt1+b1
- wlroots: `types/scene/wlr_scene.c`, `backend/drm/libliftoff.c`, `render/gles2/renderer.c`: https://gitlab.freedesktop.org/wlroots/wlroots ; pixman renderer: https://git.nixnet.services/blankie/wlroots/commit/0d90dddfab48a12a7519c11c6062b717ca3b7581
- labwc: https://github.com/labwc/labwc ; licence (GPL-2.0-only): https://archlinux.org/packages/extra/x86_64/labwc
- Weston: README and `libweston/backend-drm/state-propose.c`: https://gitlab.freedesktop.org/wayland/weston ; 2013 RAM figure: https://www.phoronix.com/news/MTQzNTQ
- sway RAM anecdote: https://elektrine.com/remote/post/1302325
- libliftoff: https://gitlab.freedesktop.org/emersion/libliftoff (MIT; gamescope on the Steam Deck)
- Android HWC: https://source.android.com/docs/core/graphics/hwc ; drm_hwcomposer planner: https://android.googlesource.com/platform/external/drm_hwcomposer/+/4c4646e%5E%21/
- flutter-pi: https://github.com/ardera/flutter-pi (README: no Pi 1 / Zero; `src/compositor_ng.c`)
- smithay GLES renderer: https://github.com/Smithay/smithay/blob/master/src/backend/renderer/gles/mod.rs ; niri: https://github.com/YaLTeR/niri
- Qt on Pi: https://forum.qt.io/topic/80698/qwayland-client-has-performance-issues-in-raspberry-pi3 , https://forum.qt.io/post/305663 , https://doc.qt.io/qtforpython-6/overviews/qtdoc-embedded-linux.html
- kmscon: https://en.wikipedia.org/wiki/Kmscon , https://phoronix.com/news/fedora-45-kmscon-vt-delay
- Pi 4 GLES 3.1: https://blogs.igalia.com/itoral/2020/01 ; Mesa on Pi: https://www.raspberrypi.com/news/vc4-and-v3d-opengl-drivers-for-raspberry-pi-an-update/
- Pi Connect forcing X11 on Zeros: https://dev.to/aaron_rose_0787cc8b4775a0/breaking-the-rules-getting-raspberry-pi-connect-working-on-unsupported-hardware-4g6d
- Repository: `docs/reports/raspberry-pi.md` (ZN-731 planes), `docs/reports/hardware/vc4-gles2-performance.md`, `docs/reports/pi-os/00-synthesis.md`, `01-zinc-inventory.md`, `06-pios-tooling-and-references.md`, `07-kiosk-session-practices.md`, `docs/reports/pi-1080p.md`, `docs/plugins/display-gl.md`, `docs/plugins/display-fbdev.md`
