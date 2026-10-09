# display-gl

A GPU screen: the program's frames are shown through OpenGL, and GPU plugins (`zinc:mapping`) draw their own layers
underneath the UI. Plugin: `plugins/display-gl/` (display driver `gl`).

```json
{ "name": "mapper", "display": "gl", "targets": { "rpi1": { "width": 1280, "height": 720 } } }
```

Options (`"display": { "driver": "gl", ... }` or `plugins.display-gl`):

| option | default | meaning |
|---|---|---|
| `key` | `0` | UI pixels of exactly this colour (`0xRRGGBB` as a decimal number) are transparent; `-1` makes the UI opaque |
| `fullscreen` | `false` | macOS: start fullscreen (F toggles it at run time). The Pi is always fullscreen |
| `mode` | `""` | Pi: display mode `"1920x1080"`; default is the connector's preferred mode |

## Support matrix

| target | status | backend | notes |
|---|---|---|---|
| macos | supported, verified (screenshots through `glReadPixels`) | SDL3 window, OpenGL 3.2 core | `brew install sdl3`; Retina drawable size is used for GPU layers |
| rpi1 build on Pi 3B+ / 4 / 5 (32-bit OS) | builds in docker (Alpine 3.20 armhf, Mesa 24); **not run on hardware** | KMS/DRM + GBM + EGL + GLES 2.0, no X/Wayland | Mesa `vc4` (Pi 3, `dtoverlay=vc4-kms-v3d`) or `v3d` (Pi 4/5); run from a console (the program must be DRM master), user in the `video` and `input` groups |
| rpi1 on Pi 1 / Zero | builds; not a target for GPU work | same (vc4) | same VideoCore IV as the Pi 3 but a 700 MHz/1 GHz ARMv6 CPU: the UI overlay upload and any runtime image upload dominate; fine for a static screen, not for mapping |
| linux arm64 (Raspberry Pi OS 64-bit, Debian trixie) | supported, **verified on a Pi 3B+** (see below) | KMS/DRM + GBM + EGL + GLES 2.0 (Mesa `vc4`), same `kms.cpp` | built in `zinc/sdk-linux` (Debian `libegl-dev libgles-dev libgbm-dev libdrm-dev`), links the distribution's `libEGL` / `libGLESv2` / `libgbm` / `libdrm`; run from a console |
| esp32, ps1, ps2, wasm, sim | not supported | | no GL (sim ignores display drivers) |

The rpi1 binary is linked against Alpine's musl and Mesa (like every rpi1 build): run it on Alpine (or a system with
Alpine's `mesa-dri-gallium`, `mesa-egl`, `mesa-gbm`, `libdrm`), deployed with `zinc export --target rpi1`. On a
64-bit Raspberry Pi OS use the `linux` target instead: nothing to install on the Pi (Mesa and the EGL / GBM / DRM
libraries ship with the OS).

## How it works

- `hal.h` `HalDisplay`: registered from a static constructor; the SDL HAL skips its own window when a display plugin
  is linked. Each frame, `present` rasterizes only the damaged rows of the software UI (shared rasterizer) and uploads
  them into an overlay texture, clears the screen, calls `zgl_layers(w, h)` (GPU plugins), then draws the overlay
  with the key colour transparent, and swaps (vsync; on the Pi a page flip paced by the vblank event).
- Shaders are written once in the GLSL ES 1.00 dialect; `zgl_program(defines, vs, fs)` (in `zgl.h`) prepends
  `#version 150` + `attribute/varying/texture2D/gl_FragColor` macros on desktop GL, or `#version 100` + precision on
  GLES. Attribute 0 is `a_pos`, 1 is `a_uv`. Textures from runtime images are B,G,R,0 bytes: sample `.bgr`.
- Input: SDL events on macOS (keyboard, mouse, trackpad pinch/wheel, touch); on the Pi every `/dev/input/event*`
  device: keys, relative mouse, absolute touchscreen (single pointer). Esc quits.
- `ZINC_FRAMES=n` stops after n frames and `ZINC_SHOT=out.bmp` saves the last frame from the GL back buffer, so
  screenshots contain the GPU layers too.

## Raspberry Pi 64-bit (`linux` target), verified on a Pi 3B+

Measured 2026-09-29 on a Raspberry Pi 3 Model B+ (Raspberry Pi OS / Debian 13 trixie, aarch64, official 800x480 DSI
screen, `dtoverlay=vc4-kms-v3d`, proper supply, `lightdm` stopped). The program is built with `zinc export --target linux`
(Docker `zinc/sdk-linux`, arm64) and copied to the Pi; the binary needs nothing installed there.

What runs: the EGL context is created on the Mesa `vc4` driver, the frame loop is paced by the KMS page flip, the
software UI shows as the overlay texture, and the touchscreen is read (`ABS_X/ABS_Y` 0..799 x 0..479 plus `BTN_TOUCH`
of the FT5x06, single pointer). `ZINC_GL_INFO=1` prints the driver capabilities below and logs pointer down / up.

| capability (printed by `ZINC_GL_INFO=1`) | Pi 3B+ |
| --- | --- |
| renderer / version | `VC4 V3D 2.1`, `OpenGL ES 2.0 Mesa 25.0.7`, GLSL ES 1.0.16, EGL 1.5 |
| `highp` fragment float | supported (range 127, 23 bits); `mediump` is the same |
| max texture size, texture units | 2048, 16 |
| NPOT textures, BGRA8888, unpack subimage, VAO, 32-bit indices | yes (`GL_OES_texture_npot`, `GL_EXT_texture_format_BGRA8888`, `GL_EXT_unpack_subimage`, `GL_OES_vertex_array_object`, `GL_OES_element_index_uint`) |
| packed depth-stencil, depth textures | yes |
| `GL_OES_standard_derivatives`, `GL_EXT_shader_texture_lod` | **no** (analytic anti-aliasing must pass the pixel size as a uniform) |
| `GL_EXT_multisampled_render_to_texture` | no |
| MSAA window configs (XRGB8888) | 4 samples: 3 configs; 8 samples: none |
| `GL_OES_EGL_image_external`, `EGL_EXT_image_dma_buf_import` (+ modifiers) | yes (zero-copy video path is possible) |
| `EGL_MESA_platform_gbm` | no (the code falls back to `eglGetDisplay`, works) |

"GL overlay baseline": the same UI (`examples/ui/kit-gallery` at 800x480, whole page moving every frame so the whole
screen is damaged; 600 frames, `ZINC_PROFILE=1`, two runs each with the same numbers, no throttling flag during the
runs) in fbdev mode and in `gl` mode:

| display | effective fps | `present` p50 / p99 | CPU (user time / wall) |
| --- | --- | --- | --- |
| fbdev, 1 thread (`ZINC_RENDER_THREADS=1`) | 91.5 (not paced: `FBIO_WAITFORVSYNC` returns at once) | 9.6 / 10.6-11.0 ms | 6.4 s / 6.5 s = 98 % of one core |
| fbdev, 4 threads (default) | 120.5 (not paced) | 4.9 / 5.4-6.3 ms | 11.6 s / 5.0 s = 2.3 cores |
| `gl` (overlay texture, software raster on one thread) | **56.7, paced by the 60 Hz page flip** | 15.65 / 31.1-31.7 ms | 7.0 s / 10.6 s = 66 % of one core |

Reading: `gl` mode does not make the rasterization cheaper (the same single-thread software raster, then a
`glTexSubImage2D` upload of the damaged rows), it adds the upload and the swap; its gain is the vsync pacing (no
tearing, the CPU sleeps instead of spinning: 66 % of a core against 98 %). About one frame in ten misses a vblank
(p99 = two refreshes), so 56.7 fps. This is the baseline the GPU renderer of
[docs/reports/gpu-renderer-design.md](../reports/gpu-renderer-design.md) has to beat: draw the command list on the
GPU instead of uploading its software rendering.

Not verified: pointer events reach a program on this touchscreen (the driver reads the right axes and buttons and
logs transitions under `ZINC_GL_INFO`, but no touch was made during the measurements); multitouch (not supported by
this backend); HDMI output (only the DSI screen was connected); `rpi1` (musl) on hardware.

## GPU renderer (`renderer: "gl"`), validated on a Pi 3B+

`plugins/display-gl/src/gl_renderer.cpp` (design: [gpu-renderer-design.md](../reports/gpu-renderer-design.md)) ran on the
Pi 3B+ (`linux` target, `VC4 V3D 2.1`, GLES 2.0 Mesa 25.0.7) **without any change**: the GLSL ES 1.00 uber shader
compiles and links, the `GL_LUMINANCE` glyph atlas and the 800x480 (non power of two) render texture work, and no
fallback to the CPU happened. Options: `ZINC_RENDERER=cpu|gl|auto`, `ZINC_GL_STATS=1` (frames replayed / idle, draw calls,
quads, CPU time to submit), `ZINC_GL_TIME=1` (glFinish after the replay and after the present pass: GPU time per stage;
it serialises the pipeline, so use it to compare stages, not for fps).

**Correctness** (800x480 captures through `glReadPixels`, `renderer: "gl"` against `renderer: "cpu"` on the same
display-gl present pass, `scripts/pixel-diff.mjs`, threshold 8). The gl-check surface is 480x360 and is upscaled to the
screen by the present pass, so edge pixels weigh more than in the macOS numbers:

| scene | max diff | pixels > 8 | where |
| --- | --- | --- | --- |
| rects | 21 | 0.23 % | anti-aliased rounded corners |
| gradients | 19 | 0.57 % | rounded edges |
| borders | 19 | 0.42 % | ring edges |
| shadows | 9 | 0.001 % | |
| clip | 16 | 0.03 % | rounded clip edges |
| text | 3 | 0 % | none visible |
| images | 196 | 0.62 % | the 1 px shift of a runtime image at a fractional origin |
| hero Home | 246 | 3.5 % | chart and rings (`LINE` / `POLY`, not drawn yet) |
| hero Kit | 246 | 0.40 % | sidebar / search / bell icons (`LINE`) |
| hero Forms | 246 | 0.34 % | the same icons |

**Cost** (600 frames per run, `throttled` never had bits 0-2 or 16-18 set, only the sticky soft-temperature bit 19,
47-55 C). CPU % = (user + sys) / wall. The `gl` and `cpu` rows use the same display-gl driver and are paced by the 60 Hz
page flip; the fbdev rows are not paced (`FBIO_WAITFORVSYNC` returns at once), so compare their CPU, not their fps.
"per frame" is the CPU time to submit the GL frame, or the software raster time.

| screen (frames replayed / 600) | renderer | fps | CPU % of one core | per frame |
| --- | --- | --- | --- | --- |
| kit-gallery swaying, whole surface (600) | gl | 38.7 | 15 | 1.1 ms |
| | cpu (display-gl) | 57.3 | 70 | 7.2 ms |
| | fbdev, 4 threads | 120.2 | 236 | |
| | fbdev, 1 thread | 91.5 | 98 | |
| hero Home (600) | gl | 28.5 | 13 | 1.1 ms |
| | cpu (display-gl) | 51.8 | 42 | 4.5 ms |
| | fbdev, 4 threads | 111.3 | 110 | |
| hero Kit (186) | gl | 42.2 | 18 | 1.8 ms |
| | cpu (display-gl) | 53.5 | 26 | 3.7 ms |
| | fbdev, 4 threads | 110.3 | 51 | |
| hero Forms (40) | gl | 50.7 | 16 | |
| | cpu (display-gl) | 53.6 | 18 | 8.1 ms (43 frames) |
| | fbdev, 4 threads | 111.1 | 42 | |
| static scene, idle (1) | gl | 57.4 | 5.7 | 599 frames not replayed |
| | cpu (display-gl) | 57.8 | 5.0 | |

The GL numbers for hero leave out `LINE` / `POLY` (2000-24000 commands skipped over the run), so they under-count the
work. The first replayed frame costs 22-25 ms of CPU (shader compile, first atlas fill).

**What the numbers say.** The GPU renderer cuts the CPU work per frame by 4-6x (7.2 to 1.1 ms on the whole-surface
animation, 70 % to 15 % of a core), and an idle screen is as cheap as with the CPU renderer. But it does **not** raise
the paced frame rate: on the whole-surface animation it is slower (38.7 against 57.3 fps) because the frame is
GPU-bound. `ZINC_GL_TIME` on that scene (925 quads, 2 draw calls): replay pass **12.7 ms**, present pass **2.8 ms**,
then the wait for the page flip; 15.5 ms of GPU work per frame sits right at the 16.7 ms vblank, so about one frame in
three misses it. Skipping command kinds (temporary experiment): with nothing drawn the replay costs 1.2 ms; shadows
(21 quads) cost 2.8 ms, borders (22 quads) 1.6 ms, fills (49 quads) 1.5 ms, and the 831 glyph quads about 0.8 ms in
isolation; borders + shadows + fills together account for 6 ms.

**Tried and dropped**: splitting the uber shader into three programs (fills / text / images), on the theory that the
VC4 pays for every branch. It made things worse (90 draw calls instead of 2, replay 15.7 ms, 5.8 ms of CPU) because
the programs interleave in painter's order and every switch breaks a batch.

### Phase 1b: frame time and pacing (2026-09-29)

Three changes, each behind an environment switch so one binary can be compared with itself:

| change | switch (default) | what it does |
| --- | --- | --- |
| pipelined page flip (`kms.cpp`) | `ZINC_GL_PIPE=1` (on) | the wait for a page flip happens at the start of the NEXT swap instead of right after requesting it, so the CPU work of frame N+1 overlaps the GPU work and the vblank wait of frame N (`0`: wait right after the request, the old behaviour) |
| direct replay | `ZINC_GL_DIRECT=2` (adaptive; `0` texture, `1` always) | when the surface is the screen size, nothing draws under it (no `zgl_layers`) and at least half of it changed, the command lists are drawn straight into the window framebuffer (vertex shader flips y, scissor and clip-corner copies follow): no render texture, no full-screen copy pass. Smaller damage keeps the texture path (the window content is undefined after a swap, so it always needs the whole frame) |
| cheap quads | `ZINC_GL_SPLIT=1` (on) | an opaque interior needs no coverage maths: a filled rounded rect becomes one solid quad plus four bands for the rim, a border only its four bands, a shadow a solid quad for the box shrunk by blur / 2 plus four falloff bands. Quads that fall outside the current clip are no longer submitted |
| damage-limited replay | `ZINC_GL_DMG=0` (off) | scissors the replay into the surface texture to the damage rectangle. **Off: suspected of hanging the VC4 GPU (see below)** |
| occlusion | `ZINC_GL_OCCLUDE=1` (on) | with a depth buffer (24 bits on desktop and with `OES_depth24`, 16 bits up to 16k commands), the opaque square RECTs and CLEARs outside clips are drawn first, front to back with depth writes, through a program of their own (one 24-byte instance a rectangle on desktop GL, four 16-byte vertices on GLES 2); every other command is then depth-tested at its place in the paint order, so what they hide costs no fragment shading (ZN-412.01) |
| culling | `ZINC_GL_CULL=1` (on) | a list of 2048 commands or more first goes through `zrt::raster::cull_pack` (each command's tile range in 8 bytes, on 4 threads) and `cull_walk` (from the last command back, a tile closed under an opaque rectangle, tiles of 2/3 the opaque rectangles' size, 4 to 32 px): the commands covered whole are not submitted at all. On a tiling GPU the primitives cost even when hidden: bouncing-ball's 200k balls 4.0 ms of GPU without, 0.66 ms with (7.9k quads), for 1.5 ms of CPU (ZN-412.05) |
| vsync | `ZINC_VSYNC=1` (on) | `0`: swaps without waiting for the display (measurements) |

Correctness of the quad split was checked on macOS with `scripts/gl-compare.sh` (`ZINC_GL_SPLIT=0` and `1` give the
same numbers to the last digit: rects 2, gradients 3, borders 3, shadows 4, clip 2, text 2, images 194 max channel
difference, only the known 1 px image offset above the threshold; the split scene uses 78 quads instead of 18 for
the shadows scene). The direct path cannot run on the macOS Retina drawable (its size is not the surface size): its
pixels were **not** compared with the CPU on the Pi.

**Measured on the Pi 3B+ after the reboot** (`scripts/pi-gl-matrix.sh`: 27 runs of 600 frames, each under
`timeout -s KILL 60`, GPU reset counter read before and after each: **0 resets in the whole batch**, `throttled` 0x0
before and after every run, 47-56 C). fps = 600 frames over the wall time (about half a second of start-up included,
so 57 fps is a 60 Hz pace); CPU = (user + sys) / wall in % of one core; `present` p99 in ms. Rows are cumulative:
"old" = `PIPE=0 DIRECT=0 SPLIT=0`, then `PIPE=1`, then `DIRECT=2`, then `SPLIT=1`; `cpu` = software raster on the same
display-gl driver with the pipelined flip. All GL rows are `renderer: "gl"`, `ZINC_GL_DMG` off.

| screen (frames replayed of 600) | old | + pipelined flip | + direct replay | + cheap quads | cpu (display-gl) |
| --- | --- | --- | --- | --- | --- |
| kit-gallery swaying, whole surface (600) | 41.9 / 16 % / 31.9 | 57.2 / 17 % / 15.7 | **57.3 / 17 % / 15.7** | **57.2 / 19 % / 15.7** | 57.9 / 70 % / 17.1 |
| hero Home (600) | 28.5 / 14 % / 48.3 | 53.5 / 24 % / 35.1 | 53.6 / 24 % / 31.6 | 53.5 / 25 % / 31.1 | 54.1 / 41 % / 30.3 |
| hero Kit (~158) | 42.8 / 17 % / 46.0 | 53.3 / 21 % / 33.1 | 53.2 / 20 % / 32.4 | 53.7 / 20 % / 31.5 | not run |
| hero Forms (~40) | 50.7 / 15 % / 48.0 | 52.8 / 15 % / 42.7 | 52.5 / 16 % / 39.6 | 52.8 / 17 % / 38.3 | not run |
| static scene, idle (1) | 57.6 / 5 % | 57.6 / 5 % | 57.5 / 5 % | 57.6 / 5 % | not run |

Bisect on Kit (old, +pipe, +direct, +split): 39.4, 52.9, 53.4, 53.4 fps, all clean. Last, on purpose,
`ZINC_GL_DMG=1` (damage-limited replay, `DIRECT=0 SPLIT=0 PIPE=0`): 52.8 fps, clean (the string is in the binary; the
run replayed 153 frames against 158-189 for the others, which fits but is not a proof that the scissor was active).

Reading: **the pipelined flip is what matters**: it takes every screen that changes to the vblank pace (Home 28.5 to
53.5, the swaying scene 41.9 to 57.2, Kit 42.8 to 53.3) and costs a few more CPU percent because the loop no longer
sleeps in the flip wait. Direct replay and the quad split move fps, CPU and p99 by less than the run-to-run noise
(a few tenths of fps, 1-3 points of CPU, 1-4 ms of p99 on Home and Kit): they are not proven wins on these screens
(the `ZINC_GL_TIME` per-stage measurement was not repeated with them). Compared with the software raster on the same
driver, the GL renderer uses 17-25 % of a core against 41-70 % on the two screens measured, at the same frame rate.
Home stays at 53.5 fps and 24-25 % of a core with `LINE` / `POLY` still skipped.

**Acceptance targets** (>= 55 fps paced, <= 25 % of a core, idle no worse): whole-surface animation 57.2 fps / 17 %:
met; idle 5 %: met; Home 53.5 fps / 24 %: fps not met (`LINE` / `POLY` missing, so it would be lower with them); Kit
53.3 fps, Forms 52.8 fps: not met (a p99 of 32-43 ms means a missed vblank now and then; the effective rate stays
just under 55); CPU met everywhere.

**The GPU hang: not reproduced, cause not confirmed.** The earlier batch (binary without quad culling, damage-limited
replay always on) hung the VC4 on Kit and Forms: 2 s stalls (`present` p99 2021 ms, 11-15 fps) and one run that never
ended (`Resetting GPU` about once a second, unkillable process, power cycle needed). The same configuration
(`PIPE=0 DIRECT=0 SPLIT=0`) with the new binary gives Kit 42.8 fps and p99 46 ms, and even with `ZINC_GL_DMG=1` no
reset occurred. What changed between the two binaries: quads outside the current clip are no longer submitted (so no
empty scissor reaches the GPU) and the damage-limited replay became optional. The evidence fits the hypothesis "empty
scissor rectangles from the damage-limited replay hang the VC4", but the hang was intermittent (2 s stalls in most
runs, permanent in one) and one clean batch cannot prove that it is gone. The old binary was not rerun on purpose
(a permanent hang costs a power cycle). **Defaults kept**: pipelined flip on, direct replay adaptive, quad split on,
damage-limited replay off (precaution: it gains nothing measurable, screens with small damage are cheap already).
Any experiment with `ZINC_GL_DMG=1` or a new scissor pattern on this GPU must run under `timeout -s KILL` with the
reset counter checked before and after, as `scripts/pi-gl-matrix.sh` does.

**Touch under `renderer: "gl"`: not verified.** `/dev/uinput` is root only, so no synthetic touch could be injected, and
nobody touched the screen during a 120-frame run with `ZINC_GL_INFO=1` (0 pointer transitions logged, as expected).
The raw events of the FT5x06 were verified in phase 0 and the pointer code in `kms.cpp` does not depend on the renderer.

**`auto` fallback when EGL cannot start: partly verified.** With libglvnd pointed at no vendor
(`__EGL_VENDOR_LIBRARY_DIRS=/nonexistent`), `renderer: "auto"` logs one line (`display-gl: eglInitialize failed`), the
display driver declines and the program keeps running and exits normally (code 0, 60 frames), but on the `linux`
target's null HAL: there is no screen output, it is not a software display. The other fallback (context fine but the
GL renderer cannot be created: shader, framebuffer) falls back to the software overlay with one line
(`display-gl: renderer auto: GL setup failed, using cpu`) but could not be provoked on the Pi.

**Not done, from the earlier list**: cheaper shadows through a precomputed texture or 9-slice, `EGL_EXT_buffer_age`
for partial redraws over the window buffer.

## Limits

- The overlay is keyed, not alpha-blended: anti-aliased UI edges fade to the key colour (a dark fringe on black).
- The whole overlay is drawn every frame (one textured quad), even when empty.
- Pi: one connector (the first connected one), no hotplug, no rotation (use `zinc:mapping` corners), no multitouch (a touchscreen is a single pointer; fbdev reports several).
