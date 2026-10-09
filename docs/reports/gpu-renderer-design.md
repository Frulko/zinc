# GPU renderer for Zinc: design

Date 2026-09-29. Status: design, implementation starting (phases 0 and 1). Motivation and measurements:
[raspberry-pi.md](raspberry-pi.md), [render-perf-options.md](render-perf-options.md).

## 1. Goal

Put rasterization and presentation on the GPU wherever there is one, keep the CPU for logic, layout and the emission
of draw commands, and keep a **CPU-only mode** that stays the reference. Like Raylib, which draws through an OpenGL
backend (`rlgl`) and has a software one (`rlsw`), the choice is a backend behind one stable drawing API. This applies
to every program that draws through `zinc:ui` / `zinc:gfx`, not to one demo.

Why: on a Pi 3B+ the shared software rasterizer costs 70-85 ms per heavy frame on one core, 25 ms on four
([raspberry-pi.md](raspberry-pi.md)); it also burns the cores the program's logic needs.

Non-goals: replacing the software rasterizer (it is the oracle of every target and the only path on esp32, ps1, ps2,
rmpp e-ink, sim); bit-identical pixels between backends (impossible, see section 9); a general 3D engine
(`zinc:3d` / `zinc:three` are separate).

## 2. What exists today

Facts from the code (`runtime/gfx.cpp`, `runtime/zrt_raster.h`, `runtime/include/hal.h`, `plugins/display-gl`):

- A program's frame is a **retained list of commands**: `raster::Frame { const Cmd* cmds; uint32_t count; const char* text; const float* pts; }`
  with ten kinds: `CLEAR RECT BORDER SHADOW LINE TEXT IMAGE POLY CLIP UNCLIP`. A `Cmd` carries the kind, alpha, a
  gradient mode (none, vertical, horizontal, radial), a box, radius, a border width / blur / line width, two colours,
  a font or image index and a payload (text bytes or polygon points in the frame pools).
- `gfx.cpp` keeps two frames (`bufs[cur]`, `bufs[cur ^ 1]`), converts logical to physical pixels once (`to_physical`,
  HiDPI factor `pxk`), diffs against the previous frame into up to 8 damage rectangles (`raster::diff_rects`, 0.8 ms
  on the Pi) and calls `hal_display->present(HalFrame*)` (or the target HAL). `HalFrame` only offers pixel
  callbacks: `render(rows, y0, y1)` and `render_damage`. Overlays (the dev red box, the log banner, `ZINC_VISUALIZE`)
  are additional frames drawn after the program's frame.
- Text: baked glyph bitmaps (`Font.bitmap`, `Glyph{x0,y0,w,h,adv,off}`) or runtime glyphs rasterized from embedded
  TTF files (`runtime_glyph`); images are RGBA (`raster::Image`) or runtime images (`dyn_*`: video frames, camera,
  render-to-image) with a version counter and a `dyn_view` accessor meant for GPU compositors.
- `display-gl` (`plugins/display-gl`): EGL + GBM + KMS + GLES 2.0 on the Pi (`kms.cpp`), SDL3 + OpenGL 3.2 core on
  macOS (`sdl.cpp`), shaders in the GLSL ES 1.00 dialect (`zgl_program`). It **only shows the software frame as an
  overlay texture** and gives `zinc:mapping` a GPU layer hook. It is built for `rpi1` (musl, armhf) and macOS only, and
  has never run on hardware.
- Parallel software bands exist (`render_bands.h`, fbdev; a private copy in `targets/macos/hal_sdl.cpp`).

The command list is the right seam: it is a small, POD, already-deduplicated description of the frame, independent
of `zinc:ui`, and every existing program produces it.

## 3. Architecture

```
program (logic, layout, paint)  ->  frame = Cmd list  ->  Renderer (per display)
                                                          |-- cpu: raster::render()  (today, the oracle)
                                                          `-- gl : GLES2 / GL 3.2 backend (new)
```

- **Selection**: `zinc.json` `"renderer": "cpu" | "gl" | "auto"` (default `cpu` until the GL backend is proven,
  then `auto`), overridden by `ZINC_RENDERER`. `auto` falls back to `cpu` when the GL context or a required extension
  cannot be created, and prints one line saying so (Raylib's `rlsw` fallback).
- **Interface** (new, `runtime/include/hal.h`): `HalFrame` gains the frames to draw in paint order, so a GPU display
  can replay them instead of asking for pixels:
  `int32_t (*frames)(const HalCmdList** out, int32_t max)` returning the program frame then the overlays, where
  `HalCmdList` mirrors `raster::Frame` plus the physical size. Existing pixel-callback displays are untouched.
- **Ownership**: the GL backend lives in the display plugin (`plugins/display-gl`), as a `HalDisplay` whose `present`
  walks the command lists. No change to `zinc:ui`, `zinc:gfx` or programs.
- **The CPU keeps**: input, layout, `paint` (command emission), the diff (only used to skip idle frames), text
  shaping metrics (`text_advance`), glyph rasterization into the atlas, image decoding.

## 4. Command mapping (GLES 2.0 baseline)

The Pi 3's Mesa `vc4` driver is GLES 2.0 only, so GLES 2.0 is the floor; the same shaders run on desktop GL through
`zgl_program`'s preamble.

| kind | GPU implementation |
| --- | --- |
| `CLEAR` | `glClear` (or a full-screen quad when alpha < 255) |
| `RECT` (radius, alpha) | one quad; the fragment shader computes a rounded-box signed distance for anti-aliased corners; solid or gradient fill (vertical, horizontal, radial computed from the box) |
| `BORDER` | same quad, shader draws the ring between two rounded boxes |
| `SHADOW` | one larger quad; the shader evaluates a blurred rounded-box falloff (analytic approximation, `s` = blur) |
| `TEXT` | one textured quad per glyph from an alpha **glyph atlas**, tinted by the command colour; kerning / tracking as the CPU path |
| `IMAGE` | textured quad; baked images and `dyn` images are textures cached by id; nearest or linear filter from the `grad` flag; `dyn` textures re-uploaded (`glTexSubImage2D`) only when `image_version` changes |
| `LINE` | screen-space quad per segment with a coverage edge (width `s`), round joins approximated |
| `POLY` | CPU tessellation of the contours to triangles (fill rule from `pad` bit 0, nonzero or even-odd) into a vertex ring; anti-aliasing by MSAA where available, else a 1 px coverage fringe; strokes of `LINE` chains go through the same path |
| `CLIP`, `UNCLIP` | `glScissor` for axis-aligned integer rectangles; a stencil mask for rounded or non-integer clips; a clip stack mirrors the CPU one |

The order of commands is the painter's order, so batches are only merged for consecutive commands with the same
program, texture and clip state. A batch break costs one draw call; the target is a few dozen draw calls per frame.

## 5. Resources and batching

- **Vertex format**: position (2 x float), uv (2 x float), colour (4 x ubyte, premultiplied), plus per-primitive
  parameters (box half-size, radius, blur) packed in a second attribute. One dynamic vertex buffer used as a ring,
  one index buffer for quads.
- **Programs**: a small fixed set (rounded-box / gradient, glyph, image, solid triangle), not one shader per kind;
  compiled at start (compile time on the Pi is measured in phase 1; shader binaries are not cached).
- **Glyph atlas**: a 1024 x 1024 single-channel texture (`GL_ALPHA`), shelf-packed per (font id, code point), filled
  lazily from `runtime_glyph` / baked bitmaps on first use; a font-size churn (window resize, `pxk` change) resets it.
  Runtime glyphs are rasterized on the logic thread as today (`gfx.cpp` pre-rasterizes missing glyphs before the
  frame is handed over), never on the GPU thread.
- **Images**: baked `raster::Image` are uploaded once; NPOT textures are allowed in GLES 2.0 with clamp and no mipmaps.
- **Damage**: the GPU redraws the whole frame; the CPU diff is only used to **skip presenting an unchanged frame**
  (idle power). Partial updates are a CPU / e-ink concern.
- **Present**: `eglSwapBuffers` paced by the KMS page flip (display-gl already waits for the vblank event), which also
  fixes the fbdev path's missing vsync.
- **Capture**: `ZINC_SHOT` / `gfx.capture` read back with `glReadPixels`; the existing display-gl screenshot code is
  reused.

## 6. Threading

- **Phase 1**: GL calls on the logic thread, in `present`. Simple, and already much cheaper than the CPU raster;
  the CPU is free during the GPU's asynchronous work except for the final swap.
- **Phase 3**: a dedicated **render thread** owns the GL context (Flutter's raster thread, Chromium's GPU/raster split).
  The logic thread hands over a frozen command list; because `gfx.cpp` uses two buffers (current and previous for the
  diff), a third slot is needed so the logic thread can build frame N+1 while the render thread reads frame N. This
  gives the "overlap `paint` with raster" gain for free (the 6-9 ms of `paint` at 4 threads today) at the cost of one
  frame of latency, switchable.
- The frozen list must stay valid until the render thread finishes: the text and point pools are per buffer already.

## 7. Retained geometry for static scenes

Even with a GPU, the navigation would re-project the whole city on the CPU every frame (11 ms of `paint`). Immediate
mode cannot fix that; a **retained mesh** can:

- New command kind `MESH` (and `gfx.mesh*` API): the program uploads static geometry once (triangles or polylines with
  colours) and later emits `MESH(handle, 2D affine transform, alpha)`; the camera is the transform, applied by the
  vertex shader. The city map (`zinc:citymap`), charts with many points and node graphs are the users.
- The CPU backend implements `MESH` too (transform and rasterize as `POLY` / `LINE`), so the oracle and the sim stay
  complete and a program does not depend on the GPU to run.
- Deferred to phase 4: it extends the command set, so it needs the golden tests of section 9 first.

## 7b. Video

`zinc:video` frames are `dyn` images uploaded per new version (one `glTexSubImage2D` of the decoded RGB frame). The
zero-copy path (V4L2 M2M decoder dmabuf imported as an `EGLImage` external texture, no CPU colour conversion) is a
later phase and needs a Pi measurement to justify it.

## 8. Platforms

| target | renderer |
| --- | --- |
| macos | GL 3.2 core through SDL3 (`display-gl/src/sdl.cpp` exists; macOS deprecates OpenGL, Metal is a later backend behind the same interface) |
| linux arm64 / x86_64 (Raspberry Pi OS 64-bit, desktops) | KMS + GBM + EGL + GLES 2.0 from a console (`kms.cpp` exists but is built only for `rpi1`/musl: **phase 0 wires it for the `linux` target**, Debian packages `libegl-dev libgles-dev libgbm-dev libdrm-dev`) |
| rpi1 | already has the KMS backend, same code; unverified on hardware |
| wasm | WebGL 2 later, same GLES-style shaders |
| sim, esp32, ps1, ps2, rmpp | CPU only |

## 9. Testing and conformance

Zinc requires every target to print the same bytes, with the `sim` target as the oracle. The GPU renderer cannot
promise identical pixels (rounding, MSAA, driver differences), so:

- the software renderer stays the reference and its goldens (`zinc test --pixels`) do not change;
- a GL run is compared with the CPU golden with a tolerance: per-channel difference threshold plus a maximum share of
  differing pixels, reported as an image diff; kinds are tested one by one first (a scene per command kind);
- CI without a GPU: EGL surfaceless with Mesa `llvmpipe` in Docker (linux), so the GL backend is testable off the Pi;
- a `zinc bench` budget per renderer (frame time p99 on the Pi is the acceptance metric).

## 10. Phases and acceptance

| phase | content | acceptance |
| --- | --- | --- |
| 0 | Build `display-gl` for the `linux` target (arm64, glibc); run the current overlay-texture path on the Pi | `hero` presents through EGL on the Pi 3B+, vsync-paced; number recorded as the "GL overlay" baseline; documents what fails on hardware |
| 1 | `Renderer` seam in `hal.h` / `gfx.cpp`; GL backend for `CLEAR RECT BORDER CLIP UNCLIP TEXT IMAGE` (solid and gradient fills), `renderer` option and fallback | Home, Kit and Forms tabs render through GL on the Pi; llvmpipe tolerance tests per kind pass; CPU path bit-identical to before (goldens untouched) |
| 2 | `SHADOW`, `LINE`, `POLY` (tessellation, MSAA), radial gradients | Gallery, Playground, Navigation render correctly (visual + tolerance) |
| 3 | Render thread and three-slot handoff | `paint` overlaps raster; frame time p99 measured |
| 4 | `MESH` retained geometry; navigation map on it | Navigation driving at 60 fps on the Pi with `renderer: "gl"` |
| 5 | Video zero-copy, Metal / WebGL backends | measured before doing |

Targets on the Pi 3B+ (800x480): navigation driving >= 45 fps in phase 2, 60 fps in phase 4; Home and Kit with CPU
load well below one core; `renderer: "cpu"` unchanged from the numbers in [raspberry-pi.md](raspberry-pi.md).

## 11. Risks and open questions

- **vc4 limits**: GLES 2.0 only, `mediump` fragment precision by default (the rounded-box distance needs `highp` where
  available), no render-to-texture formats beyond RGBA8, tile-based rendering (avoid mid-frame framebuffer switches,
  each costs a tile flush). Shader compile time at start-up is unmeasured.
- **Console and DRM master**: the KMS backend must be DRM master, so the desktop must not run
  ([raspberry-pi.md](raspberry-pi.md)); `display-gl` also reads evdev itself (`owns_input = 1`) and does not support
  multitouch yet, whereas fbdev does.
- **Text fidelity**: glyph positions and hinting differ between the CPU path (integer glyph origins, coverage bitmaps)
  and quads with a linear-filtered atlas; the atlas must be sampled with nearest filtering at integer positions to
  match. To verify against the CPU output before choosing.
- **`POLY` cost**: tessellating large polygon sets per frame on the CPU can cost as much as it saves; measure before
  phase 2 is declared done, and cache the triangulation by (points pointer, count) when the payload is stable.
- **Two ways to draw the overlay**: the current `display-gl` overlay-texture mode (software UI, GPU layers under it,
  used by `zinc:mapping`) must keep working; it becomes `renderer: "cpu"` + GPU layers.
- **HiDPI / `pxk`**: commands arrive in physical pixels after `to_physical`; the GL viewport must match `pw x ph`.

## 12. Alternatives considered

| alternative | why not (or later) |
| --- | --- |
| Skia | complete, but tens of MB and a large dependency for a runtime that ships 70 KiB programs; overkill for ten command kinds |
| Raylib / `rlgl` directly | GLES-capable batching layer, but it has no rich vector 2D (rounded rects with shadows, paths, clips); the model is what we copy, not the code |
| NanoVG (zlib, ~3k lines, GL2 / GLES2) | closest in scope: paths by stencil-then-cover, gradients, scissor. Its GLES2 fill and stroke techniques are the reference for phase 2; its text and image handling do not fit our glyph cache and `dyn` images, so it is a source of ideas rather than a dependency |
| Keep CPU only, more threads | done first (4 threads: x2.4 fps on the Pi); it does not lower CPU load or reach 60 fps on a 3B+ |
| GPU only for the map layer (`zinc:mapping` layers) | fast to try, but it does not help the UI or any other program, and it keeps two renderers with no shared seam |

## Phase 1 implementation notes (macOS, 2026-09-29)

Done on macOS only (SDL3 + OpenGL 3.2 core through `plugins/display-gl/src/sdl.cpp`). Nothing here has run on the Pi.

**What exists**

- The seam: `HalFrame.frames` (`runtime/include/hal.h`) returns the command lists in paint order (program frame, then
  the dev red box, the log banner and the `ZINC_VISUALIZE` overlay); `runtime/gfx.cpp` fills it. Displays that only
  use `render` / `render_damage` are untouched.
- The option: `"display": { "driver": "gl", "renderer": "cpu" | "gl" | "auto" }` in `zinc.json` (it reaches the plugin as
  `ZP_DISPLAY_GL_RENDERER` through the existing display-option mechanism, no `plugin.json` change), overridden by
  `ZINC_RENDERER`. Default `cpu`. `auto` and an explicit `gl` fall back to `cpu` with one line on stderr when the setup
  fails. The choice is made on the first frame, when the surface size is known.
- The backend, `plugins/display-gl/src/gl_renderer.cpp`, is `#include`d by `display_gl.cpp` (one translation unit) so no
  new source has to be listed in `plugin.json`. It replays the lists into an RGBA texture of the surface size, then
  `display_gl.cpp` presents that texture through the same pass as the software overlay (same key colour, same linear
  upscale, `zgl_layers` underneath, same screenshots). A frame without damage is not replayed again (the swap and the
  layers still run).
- Supported: `CLEAR`, `RECT` (solid, rounded, alpha, vertical / horizontal / radial gradients), `BORDER`, `SHADOW`,
  `CLIP` / `UNCLIP` (scissor; rounded clips restore the corners exactly like the CPU, from a saved copy of the corner
  squares), `TEXT` (1024 x 1024 alpha atlas, shelf packed per (font, code point), glyphs on integer pixels, runtime
  and baked fonts), `IMAGE` (baked RGBA and runtime images, linear or nearest as on the CPU, rounded corners, version
  based re-upload). One uber shader, GLSL ES 1.00, five varyings; batches break only on a texture, clip or clear
  change. `LINE` and `POLY` are counted and skipped with one warning.
- Tools: `scripts/pixel-diff.mjs` (per-channel threshold, share of differing pixels, histogram, diff PNG),
  `scripts/gl-compare.sh` (runs both renderers on the `examples/ui/gl-check` scenes), `ZINC_GL_STATS=1` (frames replayed
  and idle, draw calls, quads, atlas glyphs, skipped kinds, CPU microseconds to submit a frame, or the software raster
  time for `renderer: "cpu"`). `examples/hero` gains `ZINC_DEMO=kit` and `ZINC_DEMO=forms`.

**Results** (max channel difference 0-255, share of pixels differing by more than 8; frames are the 1920x1440 window
capture, both renderers through the same present pass):

| scene | max diff | > 8 |
| --- | --- | --- |
| rects (radii, alpha, fractional edges) | 2 | 0 % |
| gradients (vertical, horizontal, alpha, rounded) | 3 | 0 % |
| borders | 3 | 0 % |
| shadows | 4 | 0 % |
| clip (square, rounded, nested, fractional) | 2 | 0 % |
| text (baked + runtime fonts, tracking, accents, alpha, clipped, legacy grid) | 2 | 0 % |
| images (runtime and baked, scaled, rounded, alpha) | 194 | 0.128 % |
| kit-gallery | 4 | 0 % |
| hero Kit, Forms, Settings, Tasks | 232 | 0.22 %: only the sidebar and top bar icons, which are `LINE` |
| hero Home | 232 | 9.6 %: the chart and the rings (`LINE` / `POLY`) |

The small differences are blend rounding (the CPU blends with `>> 8`). Visible differences: (1) the images scene:
a runtime image drawn 1:1 at a fractional origin is sampled by the CPU at the pixel's top-left and by the GPU at its
centre, so it can shift by one pixel (edges only); (2) everything `LINE` / `POLY` is missing (icons, charts, art).
`zinc test --pixels` (8 frames) passes, and a CPU frame of every gl-check scene is bit-identical to one built from
the previous commit (`renderer: "cpu"` is untouched).

**Deliberate deviations from the CPU renderer**

- The surface texture is cleared to black at the start of every replayed frame. The CPU keeps the previous pixels
  under a frame that has no leading `CLEAR`; the GPU does not.
- A rounded `CLIP` with a radius above 32 px, or a box partly off the surface, stays square (the CPU has a similar
  pool limit: 16384 corner pixels). Depth is 16 as on the CPU.
- The whole frame is replayed when anything changed; damage is only used to skip idle frames. `render_damage` is unused.
- The texture has the surface size (`pxk` is 1 for display drivers), and is scaled to the window like the CPU overlay.
  Drawing at the window's own resolution (sharper text on HiDPI) is a later change.

**Cost on macOS (Apple silicon, not representative of the Pi)**: CPU time to build and submit a frame, against the
software raster of the damaged rows: kit-gallery 151 us (925 quads, 2 draw calls) against 186 us; hero's Gallery screen
1.15 ms (1295 quads, 29 draw calls, 147 `LINE` / `POLY` per frame not drawn) against 2.4 ms. The first frame costs
2-3 ms (shader compile, atlas fill). Draw calls stay in the low dozens.

**To check on the Pi** (the shaders were only run through OpenGL 3.2 core on macOS): compile and link on Mesa `vc4`
(GLSL ES 1.00, five `vec4` varyings, one `sampler2D`, branches on a `mode` varying, `highp` where
`GL_FRAGMENT_PRECISION_HIGH` exists); `GL_LUMINANCE` atlas upload and sampling `.r` (the macOS build uses `GL_R8`);
`glBlendFuncSeparate`, `GL_UNSIGNED_SHORT` indices, `glCopyTexSubImage2D` from the RGBA framebuffer into an RGBA
texture, a non-power-of-two framebuffer texture (800x480) with clamp and no mipmaps; the cost of the extra
full-screen present pass on a tile-based GPU; behaviour under the DRM master (console only); whether `kms.cpp` reads
the same `HalConfig` and gives the same `f->w` / `f->h`.

**Phase 2 next**: `LINE` and `POLY` (tessellation, MSAA, the gradient paint record `grad == 4`), which also unblocks
`zinc:svg`, `zinc:canvas2d` and the hero charts; drawing at window resolution; then the render thread (phase 3).

## Phase 1 validation on the Raspberry Pi 3B+ (2026-09-29)

Full data: [display-gl.md](../plugins/display-gl.md#gpu-renderer-renderer-gl-validated-on-a-pi-3b). Summary:

- **It works on `vc4` as written.** The uber shader (GLSL ES 1.00, five varyings), the `GL_LUMINANCE` atlas, the
  800x480 render texture and the `glCopyTexSubImage2D` corner restore all run on Mesa 25.0.7; nothing had to change.
  Differences with the CPU renderer are at anti-aliased edges (max channel diff 9 to 21, 0.001 to 0.6 % of the pixels)
  and the known 1 px shift of runtime images; text matches (max 3).
- **CPU load drops as designed**: 4 to 6x less CPU per frame (7.2 to 1.1 ms on a whole-surface animation, 70 % to 15 %
  of a core); idle costs the same as the CPU renderer (~5 %, 599 of 600 frames not replayed).
- **The paced frame rate does not improve yet**: a whole-surface animation is GPU-bound at ~15.5 ms per frame (replay
  12.7 ms + present pass 2.8 ms), at the 60 Hz vblank, so it runs at 38.7 fps against 57.3 for the CPU renderer on the
  same driver. Screens where most frames are unchanged are not affected.
- **Splitting the uber shader is not the answer** (measured, 90 draw calls, slower): batches are broken by program
  switches in painter's order. Section 5's "small fixed set of programs" is therefore only valid where a program
  covers a whole batch, for example one program for opaque axis-aligned rectangles and glyphs.
- **Changes to the plan.** Before phase 2's `LINE` / `POLY`, add a phase 1b that attacks the frame time: (1) draw into the
  window buffer when the surface equals the screen (no present pass, no render-to-texture store), (2) scissor the replay
  to the damage rectangles over a persistent texture, (3) cheaper shadows / borders (tight quads, a shadow texture or
  9-slice). `LINE` / `POLY` come after, and MSAA is available (4 samples, three XRGB8888 window configs) but no
  `GL_OES_standard_derivatives`, so analytic edges need the pixel size as a uniform.
- **Not verified**: touch under `renderer: "gl"`, `renderer: "auto"` fallback behaviour when EGL fails on the Pi,
  runs without a heatsink at the soft temperature limit for long sessions.

## Phase 1b: pacing, direct replay, cheap quads (2026-09-29)

Details, switches and the full tables: [display-gl.md](../plugins/display-gl.md#phase-1b-frame-time-and-pacing-2026-09-29).

- **The limiter was pacing, not fill.** The KMS backend waited for each page flip straight after requesting it, so the
  CPU work of frame N+1 never overlapped the GPU work of frame N. Waiting for the previous flip at the start of the
  next swap took every changing screen to the vblank pace on the Pi 3B+ (Home 28.5 to 53.5 fps, whole-surface
  animation 41.9 to 57.2, Kit 42.8 to 53.3) with no shader change: the overlap that the render thread of phase 3 was
  meant to give exists already at the flip.
- **Direct replay** (into the window framebuffer when the surface is the screen and most of it changes) and the
  **quad split** (solid interior, bands for the rim) are implemented and give the same pixels as the unsplit output on
  macOS; on the Pi their effect is inside the run-to-run noise. They stay on because they cannot cost pixels; they are
  not proven wins.
- **GPU vs CPU renderer on the same driver**: same frame rate, 17-25 % of a core against 41-70 %.
- **Hazard, keep in mind for phase 2:** an earlier build hung the VC4 on partially changing screens (Kit, Forms:
  `Resetting GPU` loop, unkillable process, power cycle). It was not reproduced with the current build (quads outside
  the clip are not submitted, damage-limited replay off by default), including with the replay forced on; the cause is
  not confirmed. Every GPU experiment on this driver runs under `timeout -s KILL` with the reset counter checked.
- **Acceptance of this phase:** whole-surface animation and idle met; Home 53.5 fps, Kit 53.3, Forms 52.8: just under
  the 55 fps target (Home also lacks `LINE` / `POLY`); CPU share met everywhere (<= 25 %). Touch under the GL renderer
  and the software-overlay fallback on the Pi are unverified. Phase 2 (`LINE`) has **not** been started.
