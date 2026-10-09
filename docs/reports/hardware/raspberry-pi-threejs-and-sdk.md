# Raspberry Pi: three.js from Pi 1 to Pi 5, and a Zinc Raspberry Pi SDK

Date: 2026-10-09. Status: research report. No repository code was changed and nothing was built. Audience: the Zinc
owner and the Zinc Next backlog.

Questions asked:

- **A.** How can three.js scenes run animated on a Raspberry Pi 1 at 720p and on a Raspberry Pi 3 at 1080p, using every
  technique and compromise available, in the spirit of PocketJS/Pocket3D? What does each feature cost, what frame rates
  can be expected, and which techniques give the most for the least work?
- **B.** What would a single, granular "Raspberry Pi SDK" for Zinc look like, working from the Pi 1 to the Pi 5 (and
  Zero, Zero 2, CM)? It should cover GPIO, buses, camera, display, input, audio, video, radio and power, use proven
  libraries, plug into `targets/capabilities.json` and `zinc:platform`, and be testable without hardware.

Method: web sources (cited inline, list at the end), the Broadcom *VideoCore IV 3D Architecture Reference Guide* read in
full text, Mesa and Linux sources and documentation, the three.js r162 build (the last release with WebGL 1) read
directly, and the repository's own reports and measurements. One scratch benchmark was run on this Mac (M1 Pro):
real three.js r186 on Zinc's QuickJS engine and `libzn_webgl`, from a script in `/tmp`, not committed.

Evidence tags: **[MEASURED]** is a number from a run (this session, or a repo report named next to it).
**[SOURCE]** is a figure from a cited document. **[ESTIMATE]** is arithmetic from measured and sourced figures, and the
working is shown. **[UNVERIFIED]** is a plausible claim not confirmed in code, documentation or a run.

Related reports: [raspberry-pi.md](../raspberry-pi.md) (the Pi 3B+ rig, fbdev measurements),
[display-gl](../../plugins/display-gl.md) (the GL renderer measured on the Pi 3B+),
[three-on-zinc.md](../three-on-zinc.md) (three.js r186 on QuickJS), [zinc-next-baremetal-pi.md](../zinc-next-baremetal-pi.md)
(ZN-169), [pocketjs-pocket3d.md](pocketjs-pocket3d.md) (the Pocket3D method and its cooker and pack tasks, which this
report reuses rather than duplicates).

---

## 0. Summary

1. **"three.js at 720p on a Pi 1" cannot mean the unmodified three.js runtime running on the Pi 1.** Measured this
   session: one `Mesh` costs about 20 µs of three.js JavaScript per frame on QuickJS on an M1 Pro. Scaled by published
   single-core ratios, that is about 0.35 ms on a Pi 3B+ and about 1.2 ms on a Pi 1, before the Mesa driver adds its own
   cost. The Pi 1 runs about 15 draws at 30 fps through real three.js. The Pi 3 runs about 25 at 60 fps. The way out is
   the one Pocket3D took: **author in three.js, cook the scene ahead of time, draw it with a native GLES2 renderer**, and
   keep JavaScript and Zinc out of the per-object hot path. Zinc's AOT C++ is 20–60× faster than QuickJS on numeric
   kernels (repo M4 bench), and its reference counting means no GC pauses.
2. **Real three.js still matters on the Pi 3 class, but only r162 (the last release with WebGL 1) runs on GLES2.** The
   VideoCore IV has no derivatives, no float textures, no instancing extension and only 16-bit indices. In r162 that
   breaks `MeshStandardMaterial` (its lighting chunk calls `dFdx` unconditionally), and with it every glTF material.
   Skinning breaks too (the shader uses `textureSize`/`texelFetch`, WebGL 2 only), as does `InstancedMesh` (draws are
   skipped without `ANGLE_instanced_arrays`). A Zinc compatibility layer has to emulate instancing exactly, fix 32-bit
   indices, downgrade materials and skin on the CPU in native code.
3. **The GPU is not the Pi 1's problem at 720p. Its single 700 MHz ARMv6 core is.** VC4 spec: 1 Gpixel/s and 25 M
   triangles/s at 250 MHz [SOURCE: Broadcom guide]. Q3lite runs Quake 3 at about 140 fps at 720p on a Pi 3 [SOURCE].
   The Pi 3's V3D runs at 400 MHz, not 300 (official clock table). The Pi 3 at **1080p** is fill-bound: one textured
   full-screen pass measured about 2.8 ms at 800×480 on the rig, which extrapolates to about 15 ms at 1080p. So render
   at 720p–900p and let the display scaler upscale for free.
4. **The highest-gain techniques, in order:**
   - **Hardware upscale and dynamic resolution** through the KMS plane's source rectangle (the HVS scaler).
   - **UI on its own KMS overlay plane**: no GL compositing pass and no per-frame texture upload.
   - **Draw straight to the scanout surface**: today's `gl.zincPresent` readback path must never run on a Pi.
   - **Fewer draws**: static merging, exact instancing emulation, uniform-array batching.
   - **Cheap materials**: Gouraud or unlit shading with baked lighting, no realtime shadows, no post-processing.
   - **ETC1 textures** with mipmaps.
   - **Shader warm-up** (Mesa vc4 has a disk shader cache).
   - **Fixed-timestep simulation** with pipelined page flips.
5. **Expected frame rates** (§A7, estimates until spike RPI-3D-01 measures them):
   - Pi 1 at 720p output: the cooked path holds 30 fps for a 50–80-draw diorama rendered at 640×360 and upscaled.
     Real three.js holds it only for a handful of meshes.
   - Pi 3 at 1080p output: the cooked path holds 60 fps at a 960p–720p internal resolution. Real three.js with the
     compatibility layer reaches 45–60 fps for scenes merged to 20–30 draws.
6. **Driver stack: Mesa vc4 on DRM/KMS only.** The legacy Broadcom GLES/dispmanx stack is gone from Raspberry Pi OS
   since Bullseye: `/opt/vc` was removed, and Bookworm and Trixie use KMS for every model. Mesa vc4 beat the closed
   stack on most glmark2 tests in Broadcom's own 2017 comparison. Neither the unofficial Vulkan driver for VC4
   (unmaintained since 2021) nor programming the QPUs by hand is worth the risk.
7. **Pi SDK, interface choice.** Go through the kernel interfaces directly: the GPIO character device (uAPI v2),
   i2c-dev, spidev, PWM sysfs (and `/dev/pwmchipN` on kernel 6.17 or later), termios, evdev, V4L2, DRM/KMS and ALSA.
   Use proven libraries only where they carry real logic: libcamera, FFmpeg, miniaudio (ZN-390), SDL3's gamepad
   database (already vendored), basis_universal, and meshoptimizer/cgltf (already vendored). Reach BlueZ and
   NetworkManager over D-Bus. Raspberry Pi OS ships libgpiod 1.6 on Bookworm and 2.2 on Trixie, an ABI break, so linking
   it would tie Zinc binaries to one OS release.
8. **The Pi 5 is the outlier.** Its GPIO, PWM, UART, SPI, I2C, DSI and DPI sit behind RP1, on a different gpiochip
   label, different PWM channels and separate DRM devices. It has no H.264 decoder: HEVC goes through a stateless decoder
   that needs the V4L2 request API. Everything must be discovered at run time by driver name, never by number.
9. **Testing without hardware** is a four-level pyramid:
   - Zinc's own simulators: the `hw.h` chip models and the simulated pins.
   - Linux virtual devices in a VM or CI: gpio-sim, i2c-stub, vkms, vivid/visl, snd-aloop, uinput, mac80211_hwsim and
     vhci.
   - QEMU `raspi0/1ap/2b/3b/4b` for boot, ISA, revision codes, framebuffer and buses. It has no VC4 3D, no PWM and no
     Pi 5.
   - The Pi 3B+ rig. Add a Pi Zero or Pi 1 and a Pi 5 to it: Pi 1 frame rates cannot be simulated.
10. **Backlog:** 28 ordered tasks (§D, JSON in the final hand-off), 14 for 3D and 14 for the SDK. The first two are
    cheap measurement spikes on the existing rig, which turn this report's estimates into numbers.

---

# Part A: three.js on the VideoCore (Pi 1 at 720p, Pi 3 at 1080p)

## A1. The machines

Official default clocks are from the Raspberry Pi `config.txt` documentation
([overclocking.adoc](https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/config_txt/overclocking.adoc)).
GPU APIs come from the Mesa documentation and the Igalia and Khronos statements cited below.

| Board | CPU | arm_freq | SIMD | RAM | GPU | v3d_freq | GL API | sdram_freq |
|---|---|---|---|---|---|---|---|---|
| Pi 1 A/B/A+/B+ | 1× ARM1176JZF-S (ARMv6, VFPv2) | 700 | **none** | 256/512 MB | VideoCore IV (VC4) | 250 | GLES 2.0 | 400 |
| Pi Zero / Zero W | 1× ARM1176 | 1000 | none | 512 MB | VC4 | 300 | GLES 2.0 | 450 |
| Pi 2 | 4× Cortex-A7 | 900 | NEON | 1 GB | VC4 | 250 | GLES 2.0 | 450 |
| Pi 3B | 4× Cortex-A53 | 1200 | NEON | 1 GB | VC4 | **400** | GLES 2.0 | 450 |
| Pi 3B+/3A+ | 4× Cortex-A53 | 1400 | NEON | 1 GB / 512 MB | VC4 | **400** | GLES 2.0 | 500 |
| Zero 2 W | 4× Cortex-A53 | 1000 | NEON | 512 MB | VC4 | 300 | GLES 2.0 | 450 |
| Pi 4 / 400 / CM4 | 4× Cortex-A72 | 1500–1800 | NEON | 1–8 GB | VideoCore VI (V3D 4.2) | 500 | GLES 3.1, Vulkan 1.3* | LPDDR4 3200 |
| Pi 5 / 500 / CM5 | 4× Cortex-A76 | 2400 | NEON | 2–16 GB | VideoCore VII (V3D 7.1) | 960 | GLES 3.1, Vulkan 1.3* | LPDDR4X 4267 |

\* V3DV "advertises" Vulkan 1.3 on Pi 4 and Pi 5 ([Khronos](https://www.khronos.org/news/permalink/raspberry-pi-driver-updated-with-vulkan-1.3-support));
conformant GLES 3.1 and Vulkan 1.2 were stated for the Pi 5 at launch ([Igalia](https://www.igalia.com/2023/09/28/Raspberry-Pi-5-Announced.html)).
An early Phoronix report quoted 300 MHz for the Pi 3 V3D. The official table says 400 MHz. Early Phoronix tests put the
Pi 5 GPU at 4.3× the Pi 4 on glmark2 ([Phoronix](https://www.phoronix.com/review/raspberry-pi-5-graphics/2)).

**VideoCore IV 3D**, from the Broadcom
[VideoCore IV 3D Architecture Reference Guide](https://docs.broadcom.com/doc/12358545) (VideoCoreIV-AG100-R, 2013),
read in full text [SOURCE]:

- "A fully configured system at 250 MHz": **25 M rendered triangles/s**, **1 G pixels/s with single bilinear texturing,
  simple shading, 4× multisampling**, "720p standard resolution with 4× multisampling".
- 12 QPUs (3 slices of 4). Each QPU is a 16-way SIMD processor implemented as 4 lanes over 4 cycles, with an add and a
  multiply ALU issuing in parallel. That gives 24 GFLOPS at 250 MHz, 28.8 at 300 MHz and 38.4 at 400 MHz
  ([community breakdown](https://github.com/hermanhermitage/videocoreiv/wiki/VideoCore-IV---BCM2835-Overview)).
- The front-end pipeline (rasteriser, early-Z) runs at **4 pixels per clock**.
- **Tile-based**: 64×64-pixel tiles, or 32×32 with 4× MSAA. In the binning phase, "only the vertex coordinate transform
  part of the vertex shading is performed" (a *coordinate shader*). Full vertex shading runs again in the rendering
  phase.
- "The QPUs perform all color blends in software": blending costs shader instructions.
- TMUs support every GLES 1.x/2.0 format plus **ETC1**. The maximum texture size is 2048. There are fp16 "HDR" texture
  modes, but Mesa does not expose float textures to applications (see A3).

**CPU and memory.** The Pi 1 measured 387.6 MB/s for standard `memcpy` and 136 MB/s for a plain C copy loop
([tinymembench BCM2835](https://github.com/ssvb/tinymembench/wiki/Raspberry-Pi-(BCM2835)), stock 700 MHz)
[SOURCE]. A full 1280×720×4 frame (3.7 MB) therefore costs about 10 ms of CPU just to copy on a Pi 1. No CPU-side
full-frame copy, conversion or readback is affordable there. A Pi 3B+ does about 1.87 GB/s `memset` ([OpenBenchmarking, 2018](https://openbenchmarking.org/result/1811208-SK-1811208SK53)) [SOURCE]. Single-core speed: Geekbench 5 single-core is about 101 for a Pi 3B+ (32-bit) against about
1,748 for an M1 Mac mini (user uploads on browser.geekbench.com) [SOURCE, ±20 %]. That is about **17×**. No Geekbench
figure exists for the Pi 1 (too little RAM). Its ratio to the Pi 3B+ is taken as **3–4×** [ESTIMATE]: half the clock,
and roughly 1.25 against 2.3 DMIPS/MHz for in-order ARM11 against dual-issue A53. That makes it about 50–70× slower than
an M1 core.

## A2. Driver stack: Mesa vc4 on KMS, not the Broadcom blob

| | Legacy Broadcom stack (`libbrcmGLESv2`, EGL on dispmanx) | Mesa `vc4` + DRM/KMS (`vc4-kms-v3d`) |
|---|---|---|
| Availability | Raspbian Buster and earlier. Bullseye no longer ships `/opt/vc/lib/libbrcm*` ([DietPi forum](https://dietpi.com/forum/t/omxplayer-on-bullseye-fresh-install-32-bit/5706/5)). Bookworm made KMS the default and only stack ([RPi whitepaper](https://pip-assets.raspberrypi.com/categories/1261-transitioning/documents/RP-006519-WP-1-Transitioning%20from%20Bullseye%20to%20Bookworm.pdf)). 32-bit only | Every Pi 0–3 on current Raspberry Pi OS. 32-bit Trixie (`raspbian-trixie`, ARMv6) still supports the Pi 1 and Zero ([Trixie announcement](https://www.raspberrypi.com/news/trixie-the-new-version-of-raspberry-pi-os/), [piwheels](https://blog.piwheels.org/2025/10/debian-trixie)) |
| Speed | Reference | glmark2 vc4 vs closed stack ([Anholt, XDC 2017](https://wiki.freedesktop.org/xorg/Events/XDC2017/anholt_vc4_vc5.pdf)): most tests **+8 % to +34 %**, the best two +358 % and +122 %, five tests −6 % to −13 % [SOURCE, read from the chart] |
| Compositing / scaling | dispmanx layers on the HVS | **The same HVS through DRM atomic planes**: "scaling, rotation, YUV conversion, blending", 8 planes exposed (same slides). Scaling uses the PPF (Mitchell/Netravali) filter for magnification ([vc4 plane scaling commit](https://lab.nexedi.com/kirr/linux/-/commit/21af94cf1a4c2d3450ab7fead58e6e2291ab92a9)) |
| Video | MMAL/OpenMAX (removed) | V4L2 M2M (`bcm2835-codec`) and DMA-BUF import into EGL. Measured on the rig: `EGL_EXT_image_dma_buf_import` is present ([display-gl](../../plugins/display-gl.md)) |
| Verdict | **Do not target.** Dead stack, wrong OS images, no aarch64 | **Only target.** Already validated on the Pi 3B+ by `display-gl` (Mesa 25.0.7) |

Alternatives rejected:

- The unofficial **rpi-vk-driver** (MIT, VC4 "Vulkan" subset) ran vkQuake3 at over 100 fps at 720p on a Pi 3B+, with
  the author claiming lower overhead than the GL drivers ([Phoronix](https://www.phoronix.com/news/RPi-VK-Driver),
  [CNX](https://www.cnx-software.com/2020/06/23/raspberry-pi-videocore-iv-boards-get-an-unofficial-vulkan-driver-good-enough-to-play-quake-3/)).
  It is not conformant, has no GLSL path, and has seen no pushes since April 2021. It does show that driver overhead
  matters on VC4.
- **Bare-metal QPU/HVS programming** (ZN-169 already rejected it).

## A3. What the VC4 and Mesa vc4 mean for three.js

From [Mesa's vc4 page](https://docs.mesa3d.org/drivers/vc4.html), `vc4_screen.c` and `vc4_register_allocate.c`
([sources](https://fuchsia.googlesource.com/third_party/mesa/+/main/src/gallium/drivers/vc4/)), and the capability
table measured on the rig (`ZINC_GL_INFO=1`, [display-gl](../../plugins/display-gl.md)):

| Fact | Consequence for three.js / Zinc |
|---|---|
| GLES 2.0 only ("nearly conformant"), plus a mostly correct GL 2.1 | WebGL 1 only, so three.js **r162** (WebGL 1 was removed in r163, [migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)) |
| **No `OES_standard_derivatives`, no `EXT_shader_texture_lod`** [MEASURED on the Pi 3B+] | In r162, `lights_physical_fragment` computes `geometryRoughness` from `dFdx/dFdy(nonPerturbedNormal)` unconditionally, so **`MeshStandardMaterial`/`MeshPhysicalMaterial` cannot compile**. That includes every glTF material, since GLTFLoader creates Standard. `flatShading`, `bumpMap`, normal maps without tangents and `alphaHash` also use `dFdx` (r162 `three.module.js`, chunks `lights_physical_fragment`, `normal_fragment_begin`, `bumpmap_pars_fragment`, `normalmap_pars_fragment`) |
| No float textures exposed | `SkinnedMesh` has required float vertex textures since r140 and "is not supported with WebGL 1" since r159 (migration guide). In r162 the skinning chunk calls `textureSize`/`texelFetch`, which are GLSL ES 3.00. **No GPU skinning in three.js on VC4.** PMREM, HDR environments and float render targets are also out |
| No instance divisor (`vc4_screen.c` sets no instancing cap), so no `ANGLE_instanced_arrays` | r162 `WebGLBindingStates` returns early and **draws nothing** for `InstancedMesh` without the extension |
| No `GL_UNSIGNED_INT` indices. Mesa makes a shadow copy truncated to 16 bits, "incorrect … if any of the indices were >65535" | Mesa still advertises `GL_OES_element_index_uint` [MEASURED], so meshes over 65,535 vertices **render wrongly without any error**. They must be split, or the WebGL layer must emulate 32-bit indices |
| 8 varyings, 8 vertex attributes (`max_varyings = 8`, `max_inputs = 8`) | Multi-light Phong with shadow coordinates exceeds 8 varyings |
| **No register spilling**: an allocation failure marks the compile failed (`vc4_register_allocate.c`). A threaded fragment shader that fails retries unthreaded, silently. Anholt (2017): "No register spilling means your allocator had better be good" | Big uber-shaders (three's PBR, multi-light Phong) may fail to link or fall back to single-threaded fragment shading, which halves latency hiding. Shader size is a hard budget, not only a speed one |
| Only uniforms support non-constant indexing. Inputs and temporaries become "IF ladders … very expensive" | Uniform-array pseudo-instancing (`mat[instanceId]`) is supported in hardware. Other dynamic indexing must be avoided |
| Tiled renderer with no non-tiled mode. Clearing colour and depth skips the tile load. Scissored draws skip untouched tiles. `glInvalidateFramebuffer` is unimplemented | Always clear. Never read back. Scissor partial frames. Each FBO switch is a separate binning and render job |
| ETC1: kernel support since Linux 4.10, Mesa uses it when `has_etc1` ([Phoronix](https://www.phoronix.com/news/VC4-DRM-Linux-4.10-ETC1-FS)) | Use `WEBGL_compressed_texture_etc1`. r162 supports it (the migration guide says ETC1 is WebGL 1 only since r136) |
| Occlusion queries: none. MSAA: 4× (three 4-sample EGL configs on the rig), at the cost of 32×32 tiles | No GPU-driven culling. MSAA is cheap in fill but quadruples the tile count, so it pays only when vertex load is low |
| Disk shader cache in vc4: Lima's cache "heavily borrowed from the vc4 shader cache" ([Phoronix](https://www.phoronix.com/news/Mesa-Lima-Shader-Cache)) | A shader compiled once is cached across runs. Warm up all variants at load (`renderer.compile`) |
| CMA pool: 64 MB by default, `cma=256M@256M` as an example. Size plus base must stay under 512 MB on Pi 1/Zero and 1 GB on Pi 2/3 | GPU memory is CMA: textures, VBOs and render targets all come from it. The budget is about 64–128 MB on a 512 MB Pi 1/Zero |
| No MMU: the kernel validates command lists and shaders (Anholt 2017) | Every submit and every new shader costs kernel CPU time. Prefer few submits and a fixed shader set |

Tile-based consequences, from the Broadcom guide and a [general TBDR guide](https://developers.meta.com/horizon/documentation/native/android/gpu-impaired-algorithms/):

- Vertex work is done at least twice: the coordinate shader for binning, then the full vertex shader per tile. Mesa
  notes that tiling "raises the cost of vertex processing".
- Large triangles spanning many tiles cost more vertex work.
- A lower render resolution cuts both the fragment work and the number of tiles.

## A4. GPU budgets

**Theoretical** [SOURCE plus arithmetic]: the front end does 4 px/clock, so the Pi 1 tops out at 1.0 Gpx/s and the Pi 3
at 1.6 Gpx/s. QPU throughput is 48 lane-instructions/clock (dual-issue), so 12 G/s on the Pi 1 and 19.2 G/s on the
Pi 3. Pixels per second needed:

| Output | Pixels/frame | @30 Hz | @60 Hz |
|---|---|---|---|
| 640×360 | 0.23 M | 6.9 M/s | 13.8 M/s |
| 960×540 | 0.52 M | 15.6 M/s | 31.1 M/s |
| 1280×720 | 0.92 M | 27.6 M/s | 55.3 M/s |
| 1600×900 | 1.44 M | 43.2 M/s | 86.4 M/s |
| 1920×1080 | 2.07 M | 62.2 M/s | 124.4 M/s |

At 100 % QPU efficiency with 1× overdraw, that allows about 217 instructions per pixel at 720p60 on a Pi 1 and about 154
at 1080p60 on a Pi 3. Real efficiency is far lower: vertex shading shares the QPUs, TMU latency, and threading lost when
registers run out.

**Calibrated** [ESTIMATE from SOURCE]:

- Q3lite (ioquake3 with a GLES renderer) runs `timedemo four` at **about 140 fps at 720p on a Pi 3**
  ([Q3lite wiki](https://github.com/cdev-tux/q3lite/wiki)) [SOURCE].
- Quake 3 content is lightmapped multitexture at roughly 2–3× overdraw, so this is about **300 Mpx/s of "Q3-class"
  shading** on a 400 MHz VC4. It scales to about 200 Mpx/s on a 250 MHz Pi 1.
- Glmark2-es2 on a Pi 3 with Mesa vc4 scored about 101–117 in an 800×600 window
  ([Yocto list](https://docs.yoctoproject.org/pipermail/yocto/2017-April/035699.html)), which is consistent.

**Measured on the rig** [MEASURED, [display-gl](../../plugins/display-gl.md), Pi 3B+, 800×480]:

- Zinc's GLES2 UI uber-shader replay of 925 quads took 12.7 ms of GPU time.
- The textured full-screen present pass, which includes a per-frame texture update, took **2.8 ms**: about 137 Mpx/s,
  far below the theoretical rate. Some of it is probably the per-frame upload or the linear-to-tiled conversion of the
  overlay texture [UNVERIFIED].
- Taken at face value, one such full-screen pass costs **about 6.7 ms at 720p and about 15 ms at 1080p**.

**Overdraw budget** for Q3-class shading (lightmap or Gouraud plus one or two textures) [ESTIMATE]:

| Board, target | Render res | Shaded-pixel budget per frame | Overdraw budget |
|---|---|---|---|
| Pi 1 @30 | 1280×720 | about 6.7 M | about 7× |
| Pi 1 @30 | 640×360 (→720p by HVS) | about 6.7 M | about 29× |
| Pi 1 @60 | 640×360 | about 3.3 M | about 14× |
| Pi 3 @60 | 1920×1080 | about 5.0 M | **about 2.4×** (no room for post-processing, PBR or transparency layers) |
| Pi 3 @60 | 1280×720 (→1080p by HVS) | about 5.0 M | about 5.4× |
| Pi 3 @30 | 1920×1080 | about 10 M | about 4.8× |

**Material cost** [ESTIMATE, to be measured by RPI-3D-01 with `VC4_DEBUG=shaderdb`]:

| Material | Relative cost |
|---|---|
| Unlit textured (`MeshBasicMaterial`) | 1× |
| Per-vertex Lambert (`MeshGouraudMaterial`, in `examples/jsm` since three r144 moved Lambert to per-fragment) | about 1.2× |
| Per-fragment Lambert or Phong, one light | 3–6× |
| PBR (`MeshStandardMaterial`) | 8–15×, if it compiled at all |
| Each extra light | +1–3× |
| PCF shadow lookup | +1–4× per light |
| Each full-screen post pass | +1 overdraw layer at full resolution |

Conclusion: the Pi 1 at 720p is not GPU-bound for low-poly, cheaply shaded content. The Pi 3 at native 1080p60 is
fill-bound as soon as shading goes beyond Q3-class or overdraw exceeds about 2.

**Vertex budget.** The spec rate is 25 M triangles/s at 250 MHz (40 M at 400 MHz). That is a peak with a trivial
coordinate and vertex shader. Each vertex is shaded at least twice, and per-vertex lighting or skinning in the shader
multiplies the QPU cost. A safe planning figure is **≤ 30 k triangles per frame on a Pi 1 at 30 fps** and **≤ 100–150 k
on a Pi 3 at 60 fps** with simple vertex shaders [ESTIMATE, at about 20 % of peak]. A Geeks3D test on a Pi 2 (same
250 MHz VC4) drew a 270 k-triangle mesh at 17 fps, about 4.6 M triangles/s through a full pipeline
([Geeks3D](https://geeks3d.com/?p=9051)) [SOURCE].

## A5. CPU budgets: JavaScript, Zinc AOT and the driver

**Measured this session** [MEASURED]:

- Setup: M1 Pro, `build/zinc` of today, `--engine quickjs`, three.js r186 over `libzn_webgl` on Apple's GL 4.1, 320×180
  canvas, 40 frames after 5 warm-up frames. Script in `/tmp/znbench` (not in the repo). Each GL entry point was wrapped
  with a timer to split JavaScript time from GL time.
- A shared `BoxGeometry` and one shared material, so state changes are minimal. This is the best case for three.js.

| Scene | Draws/frame | GL calls/frame | `render()` ms/frame | of which in GL | three.js JS per draw |
|---|---|---|---|---|---|
| 100 × `Mesh` (Lambert) | 100 | 301 | 3.12 | 1.13 | **about 20 µs** |
| 400 × `Mesh` (Lambert) | 400 | 1,201 | 12.70 | 4.57 | about 20 µs |
| 400 × `Mesh` (Standard) | 400 | 1,201 | 13.92 | 5.05 | about 22 µs |
| `InstancedMesh` × 1,000 | 1 | 4 | 0.28 | 0.14 | 0.3 µs per instance |
| …and the JS loop updating 1,000 instance matrices | | | | | **1.76 µs per instance** (`makeRotationY` + `setMatrixAt`) |
| `import('three')` (r186, 2.1 MB of source) | | | 45–52 ms | | |
| Peak RSS of the process | | | 97 MB | | |

Per draw, three.js issues only about 3 GL calls (`uniformMatrix4fv` ×2 plus `drawElements`), because it caches program
and material state well. The cost is in three.js's own JavaScript: projection and frustum tests, render-list building,
sorting and uniform refresh.

**Scaled to the Pi** [ESTIMATE]: ×17 for a Pi 3B+ and about ×60 for a Pi 1 against the M1 (A1). The Mesa vc4 cost per
draw has never been published. It is taken as 30–80 µs on an A53 and 100–250 µs on an ARM1176: Gallium state emission,
three uniform streams (coordinate, vertex and fragment shader), BO references, and kernel validation of the submit.
Zinc AOT is taken as 20× cheaper than QuickJS (M4 bench: nbody 23.6×, mandelbrot 22.4×, spectralnorm 61.7× in
[zinc-next-m4-benchmarks.md](../zinc-next-m4-benchmarks.md)).

| Per draw, CPU | M1 (measured) | Pi 3B+ | Pi 1 |
|---|---|---|---|
| three.js on QuickJS | 20 µs | about 340 µs | about 1.2 ms |
| Zinc AOT scene code (three subset, cooked scenes) | about 1 µs | about 17 µs | about 60 µs |
| Mesa vc4 driver + kernel | n/a | 30–80 µs [UNVERIFIED] | 100–250 µs [UNVERIFIED] |

**Draw-call budget**, giving rendering 60 % of the frame [ESTIMATE]:

| | Pi 1 @30 fps (20 ms) | Pi 3B+ @60 fps (10 ms) | Pi 3B+ @30 fps (20 ms) |
|---|---|---|---|
| Real three.js on QuickJS | **about 14 draws** | **about 25 draws** | about 50 draws |
| Zinc AOT or a native cooked-pack renderer | about 75 draws | about 150 draws | about 300 draws |

Per-object animation from JavaScript costs about 30 µs per object on a Pi 3B+ and about 100 µs on a Pi 1. For example,
300 animated instances cost about 9 ms on a Pi 3 and about 30 ms on a Pi 1. Animation therefore belongs in AOT code,
in native helpers, or in the vertex shader: time-based procedural motion costs zero CPU per object.

Other CPU costs:

- **Startup**: about 0.8 s on a Pi 3B+ and 2.5–3.5 s on a Pi 1 to parse three r186 [ESTIMATE]. r162 is 1.3 MB against
  2.1 MB, so less. QuickJS bytecode precompilation removes most of it.
- **GC**: QuickJS-ng is reference counted with a cycle collector, and a three.js scene graph is full of cycles
  (`parent`/`children`). Periodic cycle scans grow with object count; the pause on a Pi has not been measured
  [UNVERIFIED]. Zinc's own engine is reference counted without a tracing pass, which matches what Pocket3D had to
  engineer around: PocketJS fights 35–175 ms GC pauses (sibling report).

## A6. three.js features on VC4: availability and cost

| three.js feature (r162, WebGL 1) | On VC4 | Cost | Pi 1 @720p | Pi 3 @1080p |
|---|---|---|---|---|
| `MeshBasicMaterial`, `map`, vertex colours, `lightMap`, `aoMap` | OK | cheapest | **use** | **use** |
| `MeshGouraudMaterial` (examples, per-vertex) | OK | cheap; vertex cost × 2 passes | **use** | **use** |
| `MeshLambertMaterial` (per-fragment since r144), `MeshPhongMaterial` | OK if the shader fits 8 varyings and registers | medium to high per pixel | avoid | 1–2 lights at reduced resolution |
| `MeshMatcapMaterial` | OK | cheap (one texture lookup) | good for "lit" looks | good |
| `MeshStandardMaterial`, `MeshPhysicalMaterial`, all glTF materials | **compile error** (`dFdx` without `OES_standard_derivatives`) | n/a | downgrade at load | downgrade at load |
| `flatShading`, `bumpMap`, normal maps without tangents, `alphaHash` | **compile error** (derivatives) | n/a | bake into textures or vertex normals | same |
| `SkinnedMesh` | **unsupported in WebGL 1** (r159). The shader needs float vertex textures and `texelFetch` | n/a | CPU skinning in native code (VFP), or baked pose flipbooks | CPU skinning in native code (NEON), or flipbooks |
| Morph targets | Attributes in WebGL 1 (limit of 8 inputs) | vertex cost | few targets | few targets |
| `InstancedMesh` | **draws nothing** without `ANGLE_instanced_arrays` | n/a | needs the Zinc emulation (RPI-3D-05) or a cooked uniform-array batch | same |
| `BatchedMesh` | **unusable on WebGL 1**: r162 `batching_pars_vertex` uses `textureSize`/`texelFetch` on a float matrix texture | n/a | cooked batching instead | same |
| Geometry > 65,535 vertices | wrong pixels (Mesa truncates 32-bit indices) | n/a | split at bake time | split |
| Realtime shadows (`shadowMap`) | depth textures exist, but each shadow light adds a full scene pass, an FBO switch and PCF taps | 2× geometry + fragment | **no**: bake, or blob shadows | 1 light, `BasicShadowMap`, 512², updated on demand only |
| Environment maps / PMREM | needs half-float render targets | n/a | matcap or a prefiltered LDR cube | same |
| Transparency | software blending on the QPU, breaks early-Z | per-fragment cost | sort, keep areas small | same |
| `EffectComposer` post-processing (bloom, SSAO, FXAA…) | each pass is a full-resolution layer, render target and job | 6.7 ms (720p) to 15 ms (1080p) per pass [ESTIMATE from the rig] | **no** | **no**. 4× MSAA instead of FXAA when vertex load is low |
| `logarithmicDepthBuffer` | needs `EXT_frag_depth` (absent) | n/a | no | no |
| Tone mapping / colour space | in-material, a few instructions | low | `NoToneMapping` or Linear | ACES OK |
| KTX2 / Basis textures | KTX2Loader needs WASM and Web Workers | n/a | native transcoder to ETC1 (RPI-3D-07) | same |
| DRACO / meshopt-compressed glTF | WASM decoders | n/a | decompress at bake time | same |

## A7. Three paths and expected frame rates

- **P-A Real three.js, unmodified.** r162 on QuickJS, through `libzn_webgl` straight onto KMS.
- **P-B Real three.js with Zinc's compatibility layer.** Material downgrade, exact instancing emulation, static merging,
  16-bit index splitting, ETC1 through a native transcoder, native matrix and skinning helpers, HVS upscaling, UI on an
  overlay plane, no post-processing.
- **P-C Cooked scene (the Pocket3D method).** The scene is authored and previewed in three.js r186 on the desktop and
  cooked into a per-tier pack (merged and quantized geometry, baked vertex lighting, ETC1, LODs, visibility, baked
  animation). A native GLES2 pack renderer draws it, and game logic runs in Zinc AOT. The GLES2 pack renderer is the
  same one the iPhone 4S plan needs (task 26 of [pocketjs-pocket3d.md](pocketjs-pocket3d.md)).

Scene classes:

- **C1** hero object: 1–5 meshes, ≤ 10 k triangles.
- **C2** diorama: 50–150 static meshes and 5–10 animated ones, 30–60 k triangles, textures.
- **C3** glTF character: skinned, 5–10 k triangles, PBR, one shadow light.
- **C4** field: 2,000 instances.
- **C5** C2 plus bloom and FXAA.

All figures are [ESTIMATE] from A4 and A5, and "fails" means the scene does not render as authored.

| | Pi 1, 720p output: P-A | P-B | P-C | Pi 3, 1080p output: P-A | P-B | P-C |
|---|---|---|---|---|---|---|
| C1 | 30–60 | 60 | 60 | 60 | 60 | 60 |
| C2 | 2–6 | 15–25 (merged to about 15 draws, 640×360 upscaled) | **30** (50–80 draws, 640×360) | 15–25 | 45–60 (20–30 draws, 960p–720p internal) | **60** |
| C3 | fails (Standard, skinning) | 5–15 (native CPU skinning, Gouraud, 640×360) | **30** (≤ 5 k triangles, flipbook or VFP skinning) | fails | 30–60 (NEON skinning, Gouraud or matcap, 720p internal) | **60** |
| C4 | fails (no instancing) | < 5 (2,000 emulated draws) | **30** (uniform-array batches of 64–128, vertex-shader animation) | fails | 10–20 (emulated) / 60 (static instances animated in the shader) | **60** |
| C5 | < 5 | 10–20 (post removed: 25+) | 30 (bloom faked with additive sprites) | 10–20 | 20–30 at 720p internal | 60 (no post) |

Reading the table:

- On the Pi 3 class, P-B is a real product, "three.js runs here", for scenes kept to tens of draws.
- On the Pi 1, only P-C delivers animated scenes. P-A and P-B are compatibility demos.
- On the Pi 4 and Pi 5 (GLES 3.1, so WebGL 2 and three r186), P-A is the right default: the WebGL 2 path already exists
  (ZN-204), and cooking is needed only for big scenes.

## A8. Techniques ranked by gain and effort

Gain is for the target scenes (C2–C4) on the weakest board that needs the technique. Effort is S (≤ 1 day), M (2–4
days) or L (1–2 weeks).

| # | Technique | Gain | Effort | Where | Notes |
|---|---|---|---|---|---|
| 1 | **Direct-to-scanout WebGL canvas**: the WebGL default framebuffer is the KMS/GBM EGL surface. No `gl.zincPresent` (it calls `glReadPixels`, a full tile store, a CPU copy and a re-upload) | avoids a 10–20 ms per-frame catastrophe | M | libzn_webgl, display-gl | Must-have. Today `zincPresent` copies "the drawing buffer's pixels … to a zinc:gfx runtime image" (`src/gl/webgl_js.cpp:385`) |
| 2 | **Render at lower resolution and upscale on the HVS** (DRM plane `SRC` < `CRTC` rectangle). Dynamic resolution by changing `SRC_W/H` per frame while rendering into a viewport of a fixed buffer (only touched tiles are processed) | 2–4× on fill and vertex tiles | S–M | display-gl `kms.cpp` (atomic) | Free filtering (Mitchell/Netravali PPF). Check every change with `DRM_MODE_ATOMIC_TEST_ONLY`. Horizontal scaling is cheaper than vertical; unscaled layers are cheapest ([info-beamer HVS notes](https://info-beamer.com/blog/raspberry-pi-hardware-video-scaler)) |
| 3 | **UI on its own KMS overlay plane** (ARGB8888 dumb buffer, written by the software rasteriser on damage only, blended by the HVS) | removes one full-screen GL pass (2.8 ms at 800×480, about 15 ms at 1080p) and the overlay texture upload | M | display-gl | Today's `display-gl` composites the UI as a texture. Keep that path as a fallback when no plane is free |
| 4 | **Exact `ANGLE_instanced_arrays` emulation** in libzn_webgl: N draws in C++ with divisor attributes set as constant attributes from shadow buffers | JavaScript cost per instance falls from about 20 µs (a `Mesh`) to 0.3 µs. Correctness: `InstancedMesh` renders at all | S–M | libzn_webgl | Conformance-preserving. Draws stay N on the driver side; #6 removes those |
| 5 | **Static merging by material** (`mergeGeometries` at load, or in the cooker) and texture atlases | draws 5–20× fewer | S | `zinc:three-pi` helper, cooker | The single biggest CPU lever for P-B |
| 6 | **Uniform-array pseudo-instancing**: geometry replicated K times with an `instanceId` attribute, matrices in a uniform array (hardware-indexed on VC4) | N instances in N/K draws (K = 64–128) | M | cooker and pack renderer, optional three helper | The constant buffer is 64 KB per stage (`max_const_buffer0_size`) |
| 7 | **Cheap materials**: Gouraud, matcap or unlit with baked lighting. **Downgrade Standard/Physical at load** | 3–10× fragment cost. Also makes glTF compile at all | S | `zinc:three-pi` | Keep `map`, `color`, `emissive`, `lightMap`, `aoMap` |
| 8 | **Baked lighting and AO, no realtime shadows** (blob decals) | removes the shadow pass: about 2× geometry, one FBO switch, PCF taps | M | cooker (vertex-baked light, as Pocket3D does) | |
| 9 | **No post-processing**. Fold fog and tone mapping into materials. 4× MSAA instead of FXAA where vertex load is low | 6.7–15 ms per pass saved | S | docs, budget linter | |
| 10 | **ETC1 textures with mipmaps**, via KTX2/Basis transcoded natively (basis_universal, Apache-2.0) instead of KTX2Loader's WASM and workers; RGB565/RGBA4444 for UI | 4–8× less texture bandwidth and CMA | M | native module, cooker | ETC1 has no alpha: use a second ETC1 for alpha, or 4444 |
| 11 | **AOT for hot paths**: game logic, animation and scene traversal in Zinc AOT. Native helpers for three (`updateMatrixWorld`, frustum culling, CPU skinning with NEON on aarch64 and VFP on ARMv6) | 20–60× on that code | M–L | `zinc:three-pi` native, Zinc three subset | Pocket3D keeps JavaScript to about 2.2 ms per frame (sibling report) |
| 12 | **Vertex-shader animation** (time uniform: wind, bobbing, rotating parts, flipbook frames) | zero CPU per animated object | S | materials (`onBeforeCompile`) or cooker shaders | |
| 13 | **Fixed timestep with interpolation, pipelined page flip, 60/30 lock with hysteresis** | smoothness: no 40–60 oscillation | S | runtime loop (the pipelined flip exists in `kms.cpp`) | Drop to a steady 30 (flip every other vblank) rather than jitter |
| 14 | **Shader warm-up** (`renderer.compile`, `debug.checkShaderErrors = false` in production) plus Mesa's disk cache | no first-use hitches (the first GL frame cost 22–25 ms of CPU on the rig) | S | app template | |
| 15 | **Clear every frame, `preserveDrawingBuffer: false`, no `readPixels`, scissor partial redraws, few FBO switches** | avoids tile loads and stores | S | libzn_webgl policy and lint | Beware: an empty-scissor pattern is suspected of hanging the VC4 ([display-gl](../../plugins/display-gl.md)) |
| 16 | **meshoptimizer** (vendored): vertex cache and overdraw optimisation, quantisation (16-bit positions, 8-bit normals), simplification for LOD; 16-bit index splitting | 10–30 % GPU [ESTIMATE], plus correctness for big meshes | S | cooker, load-time helper | |
| 17 | **Frustum and distance culling, LOD, impostors; visibility cells or PVS in the cooker** | draws and vertices | M–L | cooker and pack renderer | |
| 18 | **QuickJS bytecode cache for three** (`JS_WriteObject` at install) | startup 2–3× faster [ESTIMATE] | S | `zinc:script` | |
| 19 | **Zero-allocation frame loop**: preallocated temporaries, GC threshold raised, cycle collection in idle frame slack | removes GC spikes | S | app guidance, `zinc:script` hooks | |
| 20 | **Video and camera on their own KMS plane** (YUV, zero-copy DMA-BUF), or an EGLImage external texture | no CPU YUV conversion or upload | M | zinc:video | |
| 21 | **Board configuration**: proper 5 V supply, no desktop, `performance` governor, heatsink. On the Pi 1, optional `core_freq`/`v3d_freq` overclock | 0–2× (an under-voltage throttle to 600 MHz was measured on the rig) | S | `zinc doctor --target pi` | |
| 22 | Mesa `drm-shim` for vc4, so the vc4 compiler checks three.js shaders on x86 in CI | catches register-allocation failures without hardware | M–L (needs a Mesa patch) | research | The vc4 no-op shim is "too noop": no precompile hook ([Mesa issue](https://gitlab.freedesktop.org/mesa/mesa/-/issues/5932)) |

Not worth doing:

- Legacy dispmanx or the Broadcom blob.
- rpi-vk-driver.
- Hand-written QPU code.
- WebGL 2 emulated on GLES2: three r186's shaders need `texelFetch`, integer textures and MRT.
- WASM or Worker-based loaders on the device.
- Depth pre-passes: VC4 early-Z works with front-to-back order, which three already sorts.

## A9. What has to change in Zinc

| Today | Change | Task |
|---|---|---|
| `libzn_webgl` creates its context through SDL3 (`offscreen.cpp`) and presents by readback (`zincPresent`) | EGL context on the display plugin's GBM surface (one DRM master), default framebuffer = scanout, swap paced by the KMS page flip | RPI-3D-02 |
| `display-gl` composites the UI as a texture; `kms.cpp` does legacy page flips | DRM atomic: primary plane scaled (render scale), UI overlay plane, test-only checks, fallback | RPI-3D-03 |
| WebGL validation passes the driver's limits through | `ZN_WEBGL_PROFILE=vc4`: limits and extensions clamped to the rig's table (8 varyings, 2048 textures, no derivatives, no float, no instancing, 16-bit indices). Usable on macOS and llvmpipe, so P-B bugs show up without a Pi | RPI-3D-04 |
| No instancing on GLES2; `element_index_uint` truncated by Mesa | Exact emulation of `ANGLE_instanced_arrays`; 32-bit indices split or rebased | RPI-3D-05 |
| Only three r186 is vendored (WebGL 2) | three r162 (MIT) vendored as the T2 three; the import map picks it on WebGL 1 or tier T2 | RPI-3D-06 |
| No Pi-specific three helpers | `zinc:three-pi`: material downgrade, merging, index splitting, KTX2/ETC1 transcoder, warm-up, CPU skinning, native matrix updates | RPI-3D-07, RPI-3D-09 |
| `plugins/three` (Zinc subset) draws through the software `zinc:3d` | Optional GLES2 backend sharing the cooked-pack renderer | RPI-3D-10 |
| Cross builds have no graphics host (`parity/03`); rpi1 is Alpine/musl static | `armhf-linux` (glibc, `-mcpu=arm1176jzf_s`, already a zig target) and `aarch64-linux` graphics hosts linked against a Raspberry Pi OS sysroot (libdrm, gbm, EGL, GLESv2 from the OS) | RPI-3D-12 |

## A10. Measurements to take first (they replace this part's estimates)

All of these run on the existing Pi 3B+ rig (`docs/reports/raspberry-pi.md`; check `vcgencmd get_throttled` around every
run).

1. **Fill**: full-screen passes per shader class (solid; textured RGBA tiled, linear and ETC1; blended; `discard`) at
   640×360, 1280×720 and 1920×1080, with `glFinish` timing → Mpx/s.
2. **Draws**: µs per draw call in Mesa vc4 (same program, uniform change only; texture change; program change), on the
   aarch64 and armhf builds.
3. **Shaders**: compile every three r162 material variant and record QPU instruction counts and failures with
   `VC4_DEBUG=shaderdb`.
4. **Real three.js**: run the C1–C4 benches of this report on the Pi with P-A and P-B.
5. **Pi 1 proxy**: `arm_freq=600`, `maxcpus=1`, `v3d_freq=250`, `core_freq=250`, armhf binary. An A53 at 600 MHz is
   still faster per clock than an ARM1176 [ESTIMATE about 1.5×], so the proxy is optimistic. A real Pi Zero or Pi 1 B+
   costs very little and closes the gap (RPI-3D-14).

---

# Part B: a Zinc Raspberry Pi SDK (Pi 1 to Pi 5)

## B1. What differs between models

| Area | Pi 1 / Zero | Pi 2 / 3 / Zero 2 W | Pi 4 / 400 / CM4 | Pi 5 / 500 / CM5 |
|---|---|---|---|---|
| ISA / OS | ARMv6 hf: **32-bit only** (Raspberry Pi OS 32-bit, `raspbian-trixie`) | ARMv7 or AArch64 | AArch64 (32-bit possible) | AArch64 only |
| User GPIO chip | `gpiochip0` (`pinctrl-bcm2835`) | `gpiochip0` (`pinctrl-bcm2835`) + `raspberrypi-exp-gpio` | `gpiochip0` (`pinctrl-bcm2711`) + exp | `gpiochip0` (`pinctrl-rp1`, 54 lines). SoC chips moved to 10–13 in Raspberry Pi's 6.6 kernel (Aug 2024), so old code asking for `gpiochip4` fails instead of driving the wrong pins ([PR 6144](https://github.com/raspberrypi/linux/pull/6144), [RPi GPIO whitepaper](https://pip-assets.raspberrypi.com/categories/685-app-notes-guides-whitepapers/documents/RP-006553-WP-2-A%20history%20of%20GPIO%20usage%20on%20Raspberry%20Pi%20devices,%20and%20current%20best%20practices.pdf)) |
| Register access (`/dev/gpiomem`, pigpio) | works, discouraged | works, discouraged | works, discouraged | **does not work** (RP1 behind PCIe). pigpio "does not yet work" there (whitepaper) |
| Hardware PWM | `pwmchip0`, 2 channels (GPIO 12/13/18/19), `dtoverlay=pwm`/`pwm-2chan` | same | same | RP1 PWM, 4 channels (12, 13, 18, 19), **a different chip number** (reported as chip 2), one channel used by the fan ([rpi-hardware-pwm](https://pypi.org/project/rpi-hardware-pwm), [Pi4J](https://pi4j.com/blog/2024/20240423_pwm_rpi5)) |
| UART on the header | PL011 `ttyAMA0` (Pi 1) | 3/Zero W: the mini-UART `ttyS0` (Bluetooth takes the PL011), `/dev/serial0` symlink | PL011 + extra UARTs by overlay | RP1 UARTs (`ttyAMA0`) + a debug UART (`ttyAMA10`) |
| Display | HDMI, composite, DSI, DPI through vc4 (KMS) | same | 2× HDMI (4K) + DSI/DPI | HDMI on BCM2712 (vc4/HVS). **DSI and DPI through RP1 drivers (`drm-rp1-dsi`, `rp1-dpi`) as separate DRM cards**; `v3d` is its own render card. Card numbers vary, so pick by driver ([forum logs](https://forum.tinycorelinux.net/index.php/topic,27781.5/wap2.html), [Volumio](https://community.volumio.com/t/rp5-waveshare-4-3-inch-dsi-lcd-didn-t-work/68349?page=3)) |
| 3D | VC4, GLES2 | VC4, GLES2 | V3D 4.2, GLES 3.1 | V3D 7.1, GLES 3.1 |
| Video decode | H.264 (V4L2 M2M stateful, `bcm2835-codec`, `/dev/video10`) | same | H.264 (`bcm2835-codec`) + HEVC (stateless, request API) | **HEVC only** (stateless `rpi-hevc-dec`, request API). **No H.264 hardware decode or encode** ([HEVC driver series](https://lkml.iu.edu/hypermail/linux/kernel/2502.0/07170.html), [RPi H.264 encode whitepaper](https://pip-assets.raspberrypi.com/categories/685-app-notes-guides-whitepapers/documents/RP-010033-WP-1-H.264%20encoding%20performance%20on%20Raspberry%20Pi%205_series%20computers.pdf), [LibreELEC](https://forum.libreelec.tv/thread/29923-rpi5-heating-and-iptv-playback-experience-severe-stuttering/)) |
| Camera | CSI-2 → `unicam` + firmware ISP (`bcm2835-isp`) | same | same | CSI-2 → `rp1-cfe` + **PiSP** back end; the libcamera pipeline `rpi/pisp` ([libcamera patches](https://patchwork.libcamera.org/cover/22524/)) |
| Radio | Zero W: Wi-Fi + BT; Pi 1: none | 3/Zero 2 W: Wi-Fi + BT | Wi-Fi + BT 5 | Wi-Fi + BT 5 |
| Power / thermal | under-voltage via the firmware mailbox (`GET_THROTTLED` 0x00030046) and `raspberrypi-hwmon` `in0_lcrit_alarm` ([kernel doc](https://docs.kernel.org/hwmon/raspberrypi-hwmon.html)) | 3B+: a soft limit of 60 °C → 1.2 GHz | same | PMIC ADCs (`vcgencmd pmic_read_adc`), fan, power button |
| Extra | | | | RP1 PIO from user space via `piolib` (BSD-3-Clause per packaging) ([RPi news](https://www.raspberrypi.com/news/piolib-a-userspace-library-for-pio-control/)) |

## B2. The module set

The principles follow the GPIO whitepaper's own advice ("the appropriate Linux subsystem is used for access") and
ARCHITECTURE.md's "prefer a proven library".

- One small Zinc module per kernel subsystem.
- The real implementation talks to the **stable kernel uAPI**, through the existing `hw.h` bus shim where a bus is
  involved.
- A proven library is linked only where it carries real logic (camera, codecs, audio mixing, gamepad mapping, texture
  transcoding).
- Daemons are reached over D-Bus, where talking to them is the supported interface (BlueZ, NetworkManager).
- Every module ships a simulator twin (`*.sim.ts` or a `hw.h` sim model) and declares `requires`.

| Module | Linux interface | Library (licence, version) | Pi 5 / per-model notes | Zinc home | Without hardware |
|---|---|---|---|---|---|
| `zinc:board` (detection) | `/proc/device-tree/{model,compatible,system/linux,revision,hat/*}`, `/proc/cpuinfo` `Revision` | none | revision bit fields: type, processor, memory, manufacturer, new-style flag ([RPi revision codes](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#new-style-revision-codes)); do not use the `Hardware:` line (it reads "BCM2835" on every model) | extends `zinc:platform` (ZN-080) | unit table of all codes; QEMU raspi machines set revisions |
| `zinc:gpio` (real backend) | GPIO chardev **uAPI v2** (`GPIO_V2_GET_LINE_IOCTL`, edge events with timestamps, bias, kernel debounce) | none: the uAPI directly. libgpiod (LGPL-2.1+; 1.6.3 on Bookworm, 2.2.1 on Trixie, per [Debian](https://packages.debian.org/search?keywords=libgpiod)) is used only as a test oracle | find the chip by label (`pinctrl-*`), never by number. Raspberry Pi kernels keep outputs after release unless `dtparam=strict_gpiod` (whitepaper) | `hw.h` gpio + the existing `zinc:gpio` (ZN-081: simulated pins today) | **gpio-sim** (configfs, kernel ≥ 5.17, [doc](https://docs.kernel.org/admin-guide/gpio/gpio-sim.html)); Zinc simulated pins |
| `zinc:i2c` | `/dev/i2c-N`, `I2C_RDWR` with an SMBus fallback | none | i2c-1 on the header; i2c-0 is the HAT EEPROM; Pi 4/5 extra buses by overlay | `hw.h` (ZN-126, in Review) | **i2c-stub** (SMBus only, not raw `I2C_RDWR`, [doc](https://docs.kernel.org/i2c/i2c-stub.html)), `hw.h` chip models |
| `zinc:spi` | spidev `SPI_IOC_MESSAGE` | none | Pi 5 SPI on RP1, same spidev | `hw.h` | `hw.h` models; QEMU 9 models the SPI controller |
| `zinc:serial` | termios on `/dev/serial0`, `ttyAMA*`, `ttyS0` | none | mini-UART baud depends on `core_freq` (fixed by `enable_uart=1`) | new small module | pty pairs (`openpty`) |
| `zinc:pwm` | sysfs `/sys/class/pwm/pwmchipN` today; `/dev/pwmchipN` ioctls (atomic, about 3–4× faster) on kernel **6.17+** ([v7 patch](https://lkml.rescloud.iu.edu/2504.2/00538.html); merged for 6.17 per the pull request notes [UNVERIFIED by tag]) | none (libpwm 1.0~rc2 is a reference, `git.kernel.org/…/ukleinek/libpwm.git`) | Pi 5 chip and channel map differ; `pwm-gpio` overlay for software PWM on any pin | `hw.h` pwm | none in-tree; a fake sysfs tree in the test runner |
| `zinc:input` | evdev (MT protocol B touch, keys, rel/abs, force feedback), udev-free hot-plug by inotify on `/dev/input` | **SDL3 3.4.16** (zlib, already vendored, joystick and gamepad currently off) for the gamepad mapping database on glibc targets; raw evdev on static builds | official 7" DSI v1 = FT5x06 (verified on the rig); Touch Display 2 = another controller, same evdev | shared evdev hub used by display-gl and display-fbdev (both already read evdev) | **uinput** devices in CI |
| Display | DRM/KMS atomic; fbdev fallback | libdrm (MIT), Mesa (MIT) from the OS | discover cards by driver (`vc4`, `v3d`, `drm-rp1-dsi`, `rp1-dpi`, `panel-mipi-dbi`); SPI panels through the kernel `panel-mipi-dbi` driver plus a `panel.bin` init file ([LWN](https://lwn.net/Articles/884545/); one known KMS hand-over bug, [RPi #5615](https://github.com/raspberrypi/linux/issues/5615)), or Zinc's own `display-st7789` over spidev | display-gl, display-fbdev | **vkms** (planes, writeback, vblank; **no scaling**, [doc](https://docs.kernel.org/gpu/vkms.html)); Mesa llvmpipe |
| `zinc:audio` | ALSA (and PipeWire/Pulse on desktop images) | **miniaudio 0.11.25** (public domain or MIT-0; runtime-linked backends, [repo](https://github.com/mackron/miniaudio)), already chosen by ZN-390; tinyalsa 2.0.0 (BSD-3-Clause) only for static musl builds | the KMS HDMI card `vc4hdmi` accepts **only `IEC958_SUBFRAME_LE`** on `hw:`; play through `sysdefault:`/`hdmi:` (alsa-lib converts), never raw ([forum](https://forum.tinycorelinux.net/index.php/topic,25933.0.html), [ALARM](https://archlinuxarm.org/forum/viewtopic.php?p=66221)); I2S DACs appear as ALSA cards by overlay | ZN-390 | **snd-aloop** / snd-dummy |
| `zinc:camera` | v1: `rpicam-vid --codec yuv420 -o -` as a child process (frames read from a pipe); V4L2 capture for UVC webcams; v2: libcamera with DMA-BUF → EGLImage or KMS plane | rpicam-apps (BSD-2-Clause) as a tool; **libcamera** (LGPL-2.1+, Raspberry Pi fork; "does not yet have a stable binary interface", [repo](https://github.com/raspberrypi/libcamera)), linked dynamically against the OS copy per OS release | Pi 5 = PiSP pipeline; every model supported by libcamera on current OS ([camera docs](https://raspberrypi.com/documentation/computers/camera_software.html)) | new plugin (follows `gphoto2`'s worker and runtime-image pattern); permission `camera` (ZN-322) | **vivid** (V4L2 test driver) for the V4L2 path; a fake `rpicam-vid` script for v1 |
| `zinc:video` (hardware decode) | V4L2 M2M stateful (H.264, Pi 0–4); V4L2 stateless with the request API (HEVC, Pi 4/5) | FFmpeg (LGPL-2.1+) from the OS: Raspberry Pi's build carries the V4L2-request and DRM-PRIME patches | Pi 5: H.264 in software | the existing `zinc:video` (FFmpeg; V4L2 M2M already listed for the Pi) | **vicodec** (stateful M2M) and **visl** (stateless) drivers |
| `zinc:wifi` | NetworkManager D-Bus (the Bookworm and Trixie default); `nmcli` as the v1 fallback | sd-bus from libsystemd (LGPL-2.1+), dlopen'ed from the OS | none | new module, permission `net` | **mac80211_hwsim** + hostapd + NetworkManager in a VM |
| `zinc:ble` | BlueZ D-Bus (`org.bluez`: adapters, GATT central, LE advertising) | sd-bus (as above). **Not SimpleBLE**: BUSL-1.1 since 2025-01-20 ([licensing](https://docs.simpleble.org/licensing)). Not NimBLE over an HCI socket: it takes the adapter from BlueZ, and its socket transport had CVE-2026-45811 before 1.10.0 ([advisory](https://security.apache.org/projects/mynewt/CVE-2026-45811.cve.json)) | Pi 1 / 2 have no radio | new module, permission `bluetooth` | BlueZ `btvirt` / **hci_vhci** |
| `zinc:power` | `/sys/class/thermal`, `cpufreq`, `hwmon` (`in0_lcrit_alarm`), mailbox `GET_THROTTLED` via `/dev/vcio`, Pi 5 power-button evdev and fan hwmon | none | the hwmon doc lists only A+ to 3B+; the mailbox path works across models [UNVERIFIED on Pi 5] | extends the existing `zinc:device` / `zinc:system` power | QEMU answers unknown tags with "success, empty", so the module must handle missing data (bare-metal report) |
| Textures, meshes (for Part A) | none | basis_universal transcoder (Apache-2.0; latest tag to pin, 1.60 or 2.0.x [verify licence file]), meshoptimizer and cgltf (MIT, already vendored) | | native module | host tests |

## B3. Notes per module

- **Why not libgpiod.**
  - Its ABI changed between the two current Raspberry Pi OS releases: v1 on Bookworm, `libgpiod3` 2.2 on Trixie. A
    dynamically linked binary picks one; a static link brings in LGPL (and the parity plan already keeps "LGPL out of
    the core").
  - The kernel uAPI v2 has been stable since Linux 5.10, and the wrapper Zinc needs (open a chip by label, request
    lines, read and write, read edge events) is about 300 lines.
  - libgpiod stays the oracle in tests (`gpioinfo`, `gpiomon` against Zinc's view), and the reason goes in the task
    notes, as ARCHITECTURE.md requires.
- **GPIO semantics.**
  - Raspberry Pi's kernels keep output state after a process releases a line (`persist_gpio_outputs`), unlike
    upstream. Zinc should expose an explicit `release(restore)` option rather than rely on either behaviour.
  - Edge events carry kernel timestamps. Expose them, since IR decoding, encoders and debouncing need them.
- **PWM timing.** Sysfs needs a write per parameter, which gives glitches between `period` and `duty_cycle`. The
  chardev applies a whole waveform atomically. Probe for `/dev/pwmchip*` first, then fall back to sysfs, and write
  `period` before `duty_cycle` when increasing.
- **Camera, simplest first.**
  - v1 spawns `rpicam-vid` through `zinc:process` and maps frames into a `zinc:gfx` runtime image. It has no ABI
    coupling, works on every model and OS release that ships rpicam-apps, and costs one copy per frame.
  - v2 is the libcamera plugin, needed for zero-copy and per-frame controls. libcamera's IPA modules are signed and
    loaded from the system install, so link against the OS libcamera; do not vendor it.
- **Display discovery.** Enumerate `/dev/dri/card*`, read `/sys/class/drm/cardN/device/driver`, and pick the card that
  has a connected connector of the wanted kind. Open the render node of `v3d` for 3D on the Pi 4/5 when the display card
  is `vc4`. Mesa's GBM and EGL already handle that pairing (kmsro) [UNVERIFIED for vc4 + v3d]. Never assume `card0`
  ([libcamera discussion](https://lists.libcamera.org/pipermail/libcamera-devel/2022-June/031110.html)).
- **Audio on HDMI.** Use alsa-lib's `hdmi:`/`sysdefault:` devices through miniaudio's ALSA backend. A raw tinyalsa path
  would have to build IEC958 subframes itself.
- **Wi-Fi and BLE.** The supported interface is D-Bus. `sd-bus` is small and present on every Raspberry Pi OS image
  (libsystemd). Load it at run time so that static or musl builds without it degrade to "capability absent".
- **Board detection feeds capabilities.** The revision code gives the model, SoC, RAM and manufacturer. Device-tree and
  device-node probes give what is actually enabled: overlays loaded, buses present, codec devices, radio. A HAT with an
  EEPROM shows up in `/proc/device-tree/hat/{product,vendor,uuid}`.

## B4. Libraries: vendor, link from the OS, or avoid

| Library | Licence | Version | Decision |
|---|---|---|---|
| SDL3 | zlib | 3.4.16 (vendored) | **reuse**: enable joystick, gamepad and HIDAPI for Linux and Pi targets (mapping database, rumble) |
| miniaudio | public domain / MIT-0 | 0.11.25 (≥ 0.11.22 for the heap-overflow fix) | **vendor** (ZN-390) |
| meshoptimizer, cgltf, stb_image | MIT / public domain | vendored | **reuse** in the cooker and helpers |
| basis_universal transcoder | Apache-2.0 [check the tag's LICENSE] | pin the latest tag | **vendor** (transcoder only) |
| three.js r162 | MIT | 0.162.0 | **vendor** next to r186 for tier T2 |
| tinyalsa | BSD-3-Clause | 2.0.0 | optional, static ARMv6 builds only |
| libdrm, Mesa (EGL, GLESv2, gbm) | MIT | from the OS | **link from the OS** (already done by display-gl) |
| libcamera | LGPL-2.1+ | from the OS (Raspberry Pi fork) | **link from the OS**, plugin built per OS release |
| FFmpeg | LGPL-2.1+ | from the OS (Raspberry Pi build) | **link from the OS** (already so) |
| libsystemd (sd-bus) | LGPL-2.1+ | from the OS | **dlopen** |
| libgpiod | LGPL-2.1+ (lib), GPL-2.0+ (tools) | 1.6.3 / 2.2.x | **test oracle only** |
| lgpio | Unlicense | | not needed (same uAPI) |
| pigpio, RPi.GPIO-style `/dev/mem` access | | | **avoid** (no Pi 5; root; fights the kernel) |
| WiringPi | LGPL-3.0 | | avoid (register access, LGPL-3) |
| SimpleBLE | BUSL-1.1 (from 2025-01-20) | | **avoid** |
| MMAL, OpenMAX, dispmanx, `libbrcm*` | | | gone from current OS |
| rpi-vk-driver | MIT | unmaintained since 2021 | avoid |
| piolib | BSD-3-Clause (per packaging) | | later, Pi 5-only extras (WS2812 and custom protocols on PIO) |

## B5. How it plugs into Zinc

1. **Targets.**
   - `aarch64-linux` stays the primary Pi target (decision D6) for Pi 3, Zero 2 W, 4 and 5 on 64-bit OS images.
   - `armhf-linux` (glibc, dynamic, `-mcpu=arm1176jzf_s`, already a zig target in `zinc-next-toolchain.md`) is the Pi 1,
     Zero and 32-bit OS target. It is preferable to the Alpine/musl-static `rpi1` path for anything that must load the
     OS's Mesa, libcamera, FFmpeg or sd-bus.
   - Both need the graphics host cross-built against a Raspberry Pi OS sysroot. That gap is recorded in `parity/03`
     ("no graphics host in cross builds"), and ZN-164's size gates matter for the Pi 1.
2. **`targets/capabilities.json`.**
   - Keep the compile-time profiles, and add Pi-specific boolean or "probe" capabilities: `i2c`, `spi`, `serial`,
     `pwm`, `camera`, `hwdec` (`h264|hevc`), `wifi`, `ble`, `dsi`, `hdmi_audio`, `i2s`.
   - The value `"probe"` would mean "decided at run time by `zinc:board`". `requires` keeps its grammar
     (`"requires": ["gpio", "pwm", "gpu>=gles2"]`).
   - `zinc doctor --target pi` prints both the profile and the probed values (ZN-175 already prints the probed GPU tier).
3. **`zinc:platform`** gains `BOARD` (for example `pi3b+`), `SOC`, `RAM_MB`, `REVISION` and `has(cap)`, which reads
   the probe. Programs pick paths at run time, for example P-B on VC4 and P-A on V3D.
4. **Plugins.** One directory per module under `plugins/` (or built-in Zinc sources, like `zinc:gpio`), with:
   - `plugin.json` targets for `linux`, `rpi1`/`armhf` and `macos` (the macOS entry is the simulator);
   - native code against `runtime/include/hw.h` (adding `gpio`, `pwm` and `uart` to the shim, whose linux, esp32 and
     sim backends exist for I2C and SPI);
   - sim twins for the host.
5. **Permissions.** ZN-322 already enforces `camera`, sockets and processes. Add `gpio`, `i2c`, `spi`, `serial`,
   `bluetooth` and `wifi`, so exported apps declare hardware access the way they declare the camera.
6. **Setup without manual steps** (the single-app vision).
   - `zinc pi setup` checks and, with consent, edits `config.txt`: `dtparam=i2c_arm=on`, `spi=on`, `enable_uart=1`, the
     `pwm` overlay, `camera_auto_detect=1` and the `vc4-kms-v3d` CMA size. It also sets group membership (`gpio`, `i2c`,
     `spi`, `video`, `render`, `input`, `audio`), boots to console for KMS apps, and selects the `performance`
     governor.
   - The `raspberry-pi.md` findings (lightdm owns KMS, the `tty` group, power) become doctor checks.

## B6. Testing without hardware

| Level | What | Proves | Cannot prove |
|---|---|---|---|
| L0 Zinc simulators | `zinc:gpio` simulated pins (ZN-081), `hw.h` sim with chip models (SSD1306, IS31FL3730, WS2812 stream, QMI8658), display emulator windows, the `ZN_WEBGL_PROFILE=vc4` clamp on macOS and llvmpipe | API behaviour, driver byte streams, three.js feature fallbacks on the VC4 subset | kernel behaviour, timing, performance |
| L1 Linux virtual devices (a QEMU `virt` VM or a CI runner with `linux-modules-extra`) | **gpio-sim** (chardev v2 backend), **i2c-stub** (SMBus path), **vkms** (atomic planes, writeback; no scaling), **vivid** (V4L2 capture), **vicodec/visl** (M2M stateful and stateless), **snd-aloop**, **uinput** (gamepad, touch), **mac80211_hwsim** + NetworkManager, **hci_vhci** + `btvirt` (BlueZ), Mesa **llvmpipe** with `MESA_GLES_VERSION_OVERRIDE=2.0` and extension overrides | the real kernel uAPI code paths of every module | Pi drivers (RP1, vc4, unicam), clocks, HVS scaling |
| L2 QEMU Raspberry Pi machines (`raspi0`, `raspi1ap`, `raspi2b`, `raspi3ap`, `raspi3b`, `raspi4b` since QEMU 9.0, [docs](https://qemu.readthedocs.io/en/master/system/arm/raspi.html)) and qemu-user `-cpu arm1176` | ARMv6 ISA, Raspberry Pi OS kernel boot, revision decoding, framebuffer, DWC2 USB HID, mailbox, I2C (BSC) and SPI controllers | **no** VC4 3D, **no** PWM, `raspi4b` without PCIe/GENET (so no USB or Ethernet on the Pi 4 model), **no Pi 5**, no CSI, no Wi-Fi |
| L3 Hardware | the Pi 3B+ rig (exists); add a Pi Zero W or Pi 1 B+ (the Pi 1 CPU and driver costs), a Pi 5 (RP1), a camera module, a USB gamepad, an I2S DAC | everything else, and all Part A numbers | |

The CI recipe ZN-133 (parked: "needs a Linux host") is where L1 and L2 belong. A single Linux VM image with the listed
modules gives most of the SDK's coverage. The cooked-pack renderer can also be checked against
[pocketjs-pocket3d.md](pocketjs-pocket3d.md)'s desktop pack viewer for pixels.

---

## C. Decisions for the owner, risks, open questions

Decisions needed:

1. **D-PI-1: Pi 1 3D means cooked scenes.** Real three.js on the Pi 1 is a compatibility demo, not the product. This
   aligns the Pi 1 with the Pocket3D cooker and pack plan.
2. **D-PI-2: vendor three r162 next to r186**, chosen by tier, and accept the API drift between them.
3. **D-PI-3: `armhf-linux` (glibc) becomes the Pi 1/Zero GPU target**, with the musl-static `rpi1` kept for
   dependency-free programs. This amends D6.
4. **D-PI-4: kernel uAPI over libgpiod**: an exception to "prefer a library", justified above.
5. **D-PI-5: buy a Pi Zero W or Pi 1 B+ and a Pi 5** for the rig (owner's step).

Risks:

- Mesa vc4 regressions or removal. It is in maintenance mode, but Raspberry Pi OS still ships it for every Pi 0–3.
- The intermittent VC4 hang seen with damage-scissored replays ([display-gl](../../plugins/display-gl.md)). Run new
  scissor and plane patterns under `timeout -s KILL` with the reset counter checked.
- CMA exhaustion on 512 MB boards.
- KMS hand-over problems with some SPI panels.
- HDMI audio format gotchas.
- libcamera ABI churn: per-OS plugin builds.
- The per-draw driver costs in A5 are unpublished. If Mesa vc4 is much slower than assumed, P-B's draw budgets halve and
  the cooked path becomes mandatory on the Pi 3 as well.

Open questions, all answered by RPI-3D-01:

- The real fill rate of a static, tiled or ETC1 full-screen pass (versus 137 Mpx/s with a per-frame upload).
- Which r162 materials fit in registers.
- The threaded-to-unthreaded fallback rate.
- The vc4 µs per draw on aarch64 and armhf.

## D. Backlog (ordered; the JSON with descriptions and acceptance criteria is in the hand-off)

| # | Key and title | Deps |
|---|---|---|
| 1 | RPI-3D-01 Measure the VC4 baseline on the Pi 3B+ rig: fill, draw cost, r162 shader budgets, Pi 1 proxy | — |
| 2 | RPI-SDK-01 Board detection and capability probe (`zinc:board`, `zinc:platform` BOARD/has) | ZN-080 |
| 3 | RPI-3D-02 WebGL straight to the KMS scanout: EGL on display-gl's GBM surface, no readback | ZN-330 |
| 4 | RPI-3D-03 DRM atomic planes in display-gl: HVS-scaled 3D plane, UI overlay plane, dynamic render scale | RPI-3D-02 |
| 5 | RPI-3D-04 `ZN_WEBGL_PROFILE=vc4`: the Pi 3B+ capability table enforced in libzn_webgl on any host | ZN-203.06 |
| 6 | RPI-3D-05 Exact `ANGLE_instanced_arrays` and 32-bit index emulation for GLES2 drivers | RPI-3D-04 |
| 7 | RPI-3D-06 Vendor three.js r162 as the WebGL 1 (tier T2) three, selected by tier | RPI-3D-04 |
| 8 | RPI-3D-07 `zinc:three-pi` helpers: material downgrade, merging, index split, warm-up, native KTX2→ETC1 | RPI-3D-05, RPI-3D-06 |
| 9 | RPI-3D-08 Frame pacing: fixed timestep, 60/30 lock, dynamic-resolution controller | RPI-3D-03 |
| 10 | RPI-3D-09 Native accelerators for three on QuickJS: matrices, culling, CPU skinning (NEON/VFP) | RPI-3D-07 |
| 11 | RPI-3D-10 GLES2 cooked-pack renderer tuned for VC4, shared with the iPhone 4S plan | pocketjs-pocket3d tasks 10 and 13, RPI-3D-03 |
| 12 | RPI-3D-11 Cooker tier T2-VC4: budgets, ETC1, 16-bit split, uniform-array batches, baked animation | pocketjs-pocket3d tasks 11–12, RPI-3D-10 |
| 13 | RPI-3D-12 armhf and aarch64 graphics hosts cross-built against a Raspberry Pi OS sysroot | ZN-164 |
| 14 | RPI-3D-13 Frame budget HUD and linter (draws, vertices, passes, uploads vs tier) | ZN-375, RPI-3D-01 |
| 15 | RPI-3D-14 Pi 1 / Zero hardware validation of the three paths | RPI-3D-11, RPI-3D-12 |
| 16 | RPI-SDK-02 GPIO chardev v2 backend in `hw.h` and the real `zinc:gpio` | ZN-081, ZN-126, RPI-SDK-01 |
| 17 | RPI-SDK-03 `zinc:i2c`, `zinc:spi`, `zinc:serial` on `hw.h` | ZN-126, RPI-SDK-01 |
| 18 | RPI-SDK-04 `zinc:pwm` (sysfs, chardev on ≥ 6.17, Pi 5 map) | RPI-SDK-02 |
| 19 | RPI-SDK-05 evdev input hub and SDL3 gamepads | RPI-SDK-01 |
| 20 | RPI-SDK-06 DRM card and connector discovery by driver (vc4, v3d, RP1 DSI/DPI, mipi-dbi) | RPI-SDK-01 |
| 21 | RPI-SDK-07 `zinc:power`: thermal, clocks, throttling, under-voltage | RPI-SDK-01 |
| 22 | RPI-SDK-08 Pi audio backends for `zinc:audio` (ALSA, HDMI IEC958 path, I2S) | ZN-390 |
| 23 | RPI-SDK-09 `zinc:camera` v1 (rpicam-vid pipe, V4L2 UVC) and v2 (libcamera, DMA-BUF) | RPI-SDK-01 |
| 24 | RPI-SDK-10 Hardware video decode on every Pi (V4L2 M2M H.264, request-API HEVC, DRM PRIME to a plane) | RPI-3D-03 |
| 25 | RPI-SDK-11 `zinc:wifi` and `zinc:ble` over D-Bus (NetworkManager, BlueZ) | RPI-SDK-01 |
| 26 | RPI-SDK-12 Capabilities, requires, permissions and `zinc pi setup` | RPI-SDK-02, 03, 04, 09, 11 |
| 27 | RPI-SDK-13 Linux kernel-simulation CI image and QEMU raspi boot tests | ZN-133 |
| 28 | RPI-SDK-14 Pi 5 validation (RP1 GPIO, PWM, UART, DSI; V3D WebGL 2 with three r186) | RPI-SDK-02, 04, 06, 10 |

Placement against `backlog/priority.json` (UI, desktop, rendering and media, then 3D/WebGL) is the owner's call.
RPI-3D-01, RPI-3D-02 and RPI-3D-03 also benefit the 2D UI on every Pi (no GL compositing pass, free scaling), so they can
go into the rendering block.

---

## Sources

Hardware and drivers:

- Broadcom, *VideoCore IV 3D Architecture Reference Guide*, VideoCoreIV-AG100-R, 2013: <https://docs.broadcom.com/doc/12358545>
- Mesa vc4 driver documentation: <https://docs.mesa3d.org/drivers/vc4.html>
- Mesa `vc4_screen.c` and `vc4_register_allocate.c`: <https://fuchsia.googlesource.com/third_party/mesa/+/main/src/gallium/drivers/vc4/>
- E. Anholt, *Status of Broadcom's vc4 and vc5 drivers*, XDC 2017: <https://wiki.freedesktop.org/xorg/Events/XDC2017/anholt_vc4_vc5.pdf>
- Linux vc4 KMS documentation: <https://docs.kernel.org/gpu/vc4.html>
- vc4 plane scaling commit (PPF/TPZ): <https://lab.nexedi.com/kirr/linux/-/commit/21af94cf1a4c2d3450ab7fead58e6e2291ab92a9>
- info-beamer, *Understanding Pi dispmanx/HVS*: <https://info-beamer.com/blog/raspberry-pi-hardware-video-scaler>
- Raspberry Pi `config.txt` overclocking (default clocks): <https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/computers/config_txt/overclocking.adoc>
- Raspberry Pi, *Transitioning from Bullseye to Bookworm*: <https://pip-assets.raspberrypi.com/categories/1261-transitioning/documents/RP-006519-WP-1-Transitioning%20from%20Bullseye%20to%20Bookworm.pdf>
- DietPi forum on `/opt/vc` removal in Bullseye: <https://dietpi.com/forum/t/omxplayer-on-bullseye-fresh-install-32-bit/5706/5>
- Raspberry Pi OS Trixie: <https://www.raspberrypi.com/news/trixie-the-new-version-of-raspberry-pi-os/>; piwheels on Trixie: <https://blog.piwheels.org/2025/10/debian-trixie>
- Raspberry Pi, vc4 and v3d driver update: <https://www.raspberrypi.com/news/vc4-and-v3d-opengl-drivers-for-raspberry-pi-an-update/>
- Igalia on the Pi 5 GPU: <https://www.igalia.com/2023/09/28/Raspberry-Pi-5-Announced.html>; Khronos on V3DV Vulkan 1.3: <https://www.khronos.org/news/permalink/raspberry-pi-driver-updated-with-vulkan-1.3-support>
- Igalia, FOSDEM 2025, *Getting more juice out from your Raspberry Pi GPU*: <https://fosdem.org/2025/events/attachments/fosdem-2025-5553-getting-more-juice-out-from-your-raspberry-pi-gpu/slides/236926/20250201-_0Ym02Fd.pdf>
- Phoronix: VC4 ETC1 (<https://www.phoronix.com/news/VC4-DRM-Linux-4.10-ETC1-FS>), Lima shader cache borrowed from vc4 (<https://www.phoronix.com/news/Mesa-Lima-Shader-Cache>), Pi 5 graphics (<https://www.phoronix.com/review/raspberry-pi-5-graphics/2>), rpi-vk-driver (<https://www.phoronix.com/news/RPi-VK-Driver>)
- CNX Software on rpi-vk-driver: <https://www.cnx-software.com/2020/06/23/raspberry-pi-videocore-iv-boards-get-an-unofficial-vulkan-driver-good-enough-to-play-quake-3/>
- Mesa issue on vc4/v3d drm-shim: <https://gitlab.freedesktop.org/mesa/mesa/-/issues/5932>
- VideoCore IV overview (QPU arithmetic): <https://github.com/hermanhermitage/videocoreiv/wiki/VideoCore-IV---BCM2835-Overview>
- tinymembench on BCM2835: <https://github.com/ssvb/tinymembench/wiki/Raspberry-Pi-(BCM2835)>
- Geeks3D, Pi 2 GPU benchmark: <https://geeks3d.com/?p=9051>
- Glmark2 on a Pi 3 (Yocto list): <https://docs.yoctoproject.org/pipermail/yocto/2017-April/035699.html>
- Q3lite: <https://github.com/cdev-tux/q3lite/wiki>
- Meta, tile-based GPU vertex costs: <https://developers.meta.com/horizon/documentation/native/android/gpu-impaired-algorithms/>

three.js and JavaScript:

- three.js migration guide: <https://github.com/mrdoob/three.js/wiki/Migration-Guide>
- three.js r162 build, read directly: <https://unpkg.com/three@0.162.0/build/three.module.js>
- three.js manual, *Optimize lots of objects*: <https://threejs.org/manual/en/optimize-lots-of-objects>
- QuickJS benchmark: <https://bellard.org/quickjs/bench.html>; V8 jitless: <https://v8.dev/blog/jitless>
- Geekbench 5 browser (user uploads; Pi 3B+ about 101 single-core, M1 about 1,748): <https://browser.geekbench.com/>
- PocketJS, *Introducing Pocket3D*: <https://pocketjs.dev/blog/introducing-pocket3d/>

SDK:

- Raspberry Pi, *GPIO usage on Raspberry Pi devices* (whitepaper, 2025): <https://pip-assets.raspberrypi.com/categories/685-app-notes-guides-whitepapers/documents/RP-006553-WP-2-A%20history%20of%20GPIO%20usage%20on%20Raspberry%20Pi%20devices,%20and%20current%20best%20practices.pdf>
- raspberrypi/linux PR 6144 (gpiochip renumbering): <https://github.com/raspberrypi/linux/pull/6144>
- Debian libgpiod versions: <https://packages.debian.org/search?keywords=libgpiod>; libgpiod docs: <https://libgpiod.readthedocs.io/>
- PWM chardev patch v7: <https://lkml.rescloud.iu.edu/2504.2/00538.html>; libpwm: <https://git.kernel.org/pub/scm/linux/kernel/git/ukleinek/libpwm.git>
- Pi 5 PWM: <https://pypi.org/project/rpi-hardware-pwm>, <https://pi4j.com/blog/2024/20240423_pwm_rpi5>
- Raspberry Pi revision codes: <https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#new-style-revision-codes>
- raspberrypi-hwmon: <https://docs.kernel.org/hwmon/raspberrypi-hwmon.html>
- libcamera, Raspberry Pi fork: <https://github.com/raspberrypi/libcamera>; camera software docs: <https://raspberrypi.com/documentation/computers/camera_software.html>; PiSP pipeline handler: <https://patchwork.libcamera.org/cover/22524/>
- Raspberry Pi HEVC decoder driver series: <https://lkml.iu.edu/hypermail/linux/kernel/2502.0/07170.html>; V4L2 nodes on the Pi: <https://ffmpeg.org/pipermail/ffmpeg-devel/2021-July/282198.html>
- Raspberry Pi, H.264 encoding on Pi 5: <https://pip-assets.raspberrypi.com/categories/685-app-notes-guides-whitepapers/documents/RP-010033-WP-1-H.264%20encoding%20performance%20on%20Raspberry%20Pi%205_series%20computers.pdf>
- LibreELEC, Pi 5 without H.264 decode: <https://forum.libreelec.tv/thread/29923-rpi5-heating-and-iptv-playback-experience-severe-stuttering/>
- Pi 5 DRM cards: <https://forum.tinycorelinux.net/index.php/topic,27781.5/wap2.html>, <https://community.volumio.com/t/rp5-waveshare-4-3-inch-dsi-lcd-didn-t-work/68349?page=3>
- libcamera on non-zero card numbers: <https://lists.libcamera.org/pipermail/libcamera-devel/2022-June/031110.html>
- vc4hdmi IEC958 format: <https://forum.tinycorelinux.net/index.php/topic,25933.0.html>, <https://archlinuxarm.org/forum/viewtopic.php?p=66221>
- miniaudio: <https://github.com/mackron/miniaudio>; tinyalsa: <https://github.com/tinyalsa/tinyalsa>
- panel-mipi-dbi: <https://lwn.net/Articles/884545/>; RPi issue 5615: <https://github.com/raspberrypi/linux/issues/5615>
- piolib: <https://www.raspberrypi.com/news/piolib-a-userspace-library-for-pio-control/>
- SimpleBLE licensing: <https://docs.simpleble.org/licensing>; NimBLE CVE-2026-45811: <https://security.apache.org/projects/mynewt/CVE-2026-45811.cve.json>
- Linux gpio-sim: <https://docs.kernel.org/admin-guide/gpio/gpio-sim.html>; i2c-stub: <https://docs.kernel.org/i2c/i2c-stub.html>; vkms: <https://docs.kernel.org/gpu/vkms.html>
- QEMU Raspberry Pi boards: <https://qemu.readthedocs.io/en/master/system/arm/raspi.html>; QEMU 9.0 Pi 4B: <https://heise.de/-9697761>

Repository:

- `docs/reports/raspberry-pi.md`, `docs/plugins/display-gl.md`, `docs/reports/three-on-zinc.md`,
  `docs/reports/zinc-next-baremetal-pi.md`, `docs/reports/gpu-renderer-design.md`,
  `docs/reports/ui-rendering-architecture.md`, `docs/reports/zinc-next-m4-benchmarks.md`,
  `docs/reports/zinc-next-toolchain.md`, `docs/reports/parity/03-plugins-targets.md`,
  `docs/reports/hardware/pocketjs-pocket3d.md`, `targets/capabilities.json`, `next/src/gl/`, `plugins/display-gl/`,
  `runtime/include/hw.h`.
