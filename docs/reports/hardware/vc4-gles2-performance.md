# GLES 2 on VideoCore IV (Mesa vc4): making 2D vector/UI rendering fast

Research for the GL replay (`runtime/gl_replay.cpp`, `plugins/display-gl`) on a Raspberry Pi 3B+ (BCM2837, "VC4 V3D 2.1",
`vc4-kms-v3d`). Written 2026-10-12. Case studied: hero's Navigation screen, about 64 draw calls and 6300 quads per frame,
184 ms per frame on the GPU, process at 11% CPU (see the last three sections of `docs/reports/raspberry-pi.md`).

Conventions. **[S]** = sourced, URL given. **[I]** = inference (mine, not stated by a source). When a source is a Mesa
source file, it was read from `main` on 2026-10-12 (raw files fetched with curl); the device runs Mesa 25/26, so a line
number may differ and behaviour should be re-checked there. Abbreviations: `VC4/` = https://gitlab.freedesktop.org/mesa/mesa/-/blob/main/src/gallium/drivers/vc4/ ;
"Guide" = Broadcom, *VideoCore IV 3D Architecture Reference Guide*, 2013-09-16, https://docs.broadcom.com/doc/12358545 (downloaded and read as text);
"Mesa vc4 doc" = https://docs.mesa3d.org/drivers/vc4.html.

Pages that could not be fetched or only partly: the Phoronix article on texture upload (HTTP 403, only a search
snippet), the RetroPie forum posts (bot check, only search snippets), the Raspberry Pi `config.txt` page (the tail with
`gpu_mem` / CMA was cut; the head was read), `gitlab.freedesktop.org` through WebFetch (blocked by Anubis; curl works).
Anholt's blog (`anholt.github.io/twivc4`) is a weekly digest from 2018-19; it has almost nothing on performance tuning, and
I found no other blog post of his on vc4 tuning, no FOSDEM/XDC talk text, and no Pi-forum post by an engineer on MSAA or
tile loads. Where a claim would need one, it is marked [I].

## 0. Reading of the measured case, before the details

- [I] 800x480 is 384,000 pixels. The Guide's peak is 1 Gpixel/s at 250 MHz "with single bilinear texturing, simple
  shading, 4x multisampling" (Guide, "Introduction"). Even 10 layers of overdraw (3.8 Mpixel) is a few ms at peak, and the
  binner is rated 25 M triangles/s (same page), so 12.6k triangles is about 0.5 ms. 184 ms is a factor 30 to 100 away
  from anything the pixel pipe or the binner should cost. So either the fragment shaders are very long, the overdraw is far
  bigger than the quad count suggests (cover quads the size of the screen), or, most likely, the job is being flushed and
  re-loaded many times (section 3). Do not trust the peak for blended, multi-varying shaders, but a gap this large points at
  a structural problem first, not at tuning.
- [I] The cheapest first experiment is `VC4_DEBUG=perf` (section 6): it prints the exact events that cost whole-frame
  loads/stores.

## 1. Architecture facts that drive cost

### 1.1 Tiling and binning

- [S] VC4 splits the screen into 64x64-pixel tiles (32x32 with 4x MSAA); each tile gets its own command list; the CPU side
  allocates the lists and per-tile commands that load or clear colour/depth, branch into the draw list and store. "Tiling
  avoids large render target caches, but it makes vertex processing more expensive. VC4 has no non-tiled mode."
  Mesa vc4 doc, "MSAA and Tile Buffer". Code: `VC4/vc4_job.c` (`job->tile_width = 32/64`).
- [S] Phases: a binning pass runs only the coordinate part of the vertex shader; the Primitive Tile Binner works out which
  tiles each primitive overlaps and builds a per-tile list "plus references to any state changes that apply". The rasteriser
  front end runs at 4 pixels per clock; the early-Z test uses a reduced-resolution shadow of the tile Z buffer; fragments go to
  QPUs in groups of 4 quads. Guide, "Architecture Overview".
- [S] Rating (250 MHz): 25 M triangles/s, 1 Gpixel/s (bilinear, simple shading, 4x MSAA). Guide, Introduction. The 3B+ 3D
  core is described as 300 MHz by cnx-software (https://www.cnx-software.com/2017/08/08/work-on-videocore-v-gpu-drivers-could-pave-the-way-for-raspberry-pi-4-board/,
  only seen as a search snippet) and by RetroPie posters as default `v3d` 300 MHz (https://retropie.org.uk/forum/post/178717, snippet).
  Sources disagree on nothing here, but the 1 Gpixel/s figure is a peak, no source I found gives a measured sustained
  pixel/s figure for blended shaded content.
- [S] A bin cost per primitive is not published as a number. What is documented: the binner needs the transformed
  coordinates, so every vertex is shaded twice (bin pass and render pass) (Guide, same section; Mesa vc4 doc says vertex
  processing is "more expensive"). Per-primitive tile-list entries grow with the number of tiles a primitive covers [I].
  A primitive that covers the whole screen is listed in all 13x8 = 104 tiles (64x64; 25x15 = 375 tiles at 32x32 MSAA) [I, arithmetic].
- [S] Hardware bug workaround HW-2116: after `0x1ef0` (7920) draw calls in one scene the driver submits the job and starts a
  new one (`VC4/vc4_draw.c`, `VC4_HW_2116_COUNT`; message "too many draw calls per scene" under `VC4_DEBUG=perf`). 64 draw calls
  is far from it.

### 1.2 QPUs and the fragment pipeline

- [S] A QPU is a 16-way (4-way multiplexed over 4 cycles) SIMD processor working on quads; four QPUs form a slice; 12 QPUs in
  the chip (the count is the well-known figure; the Guide describes slices of up to four). Guide, "QPU" chapters.
- [S] "The QPUs perform all colour blends in software, but the tile buffer carries out the Z-test and stencil-ops in
  hardware." Blending therefore means: a TLB colour read, ALU, a TLB colour write, per fragment. Guide, Architecture Overview and
  "Color Read and Write". Mesa confirms it: blend state is lowered into the fragment shader (`vc4_nir_lower_blend`,
  `qir_TLB_COLOR_READ` in `VC4/vc4_program.c`) and the blend state is part of the fragment shader key (`struct vc4_fs_key.blend` in `VC4/vc4_qir.h`).
  Consequence [I]: an opaque draw with blending off is cheaper than the same draw with blending on, and a scoreboard serialises
  overlapping fragments on the same pixel.
- [S] Varyings: each interpolated varying component costs "a single QPU instruction" (add + mul) (Guide, overview), the
  coefficients are stored per slice, "just-in-time interpolation". So the cost of the varyings that Zinc passes for edge
  distances is one instruction per component plus whatever the distance math costs. [I] 4 components of distance = ~4
  interpolation instructions, not the problem by themselves.
- [S] Limits exposed by Mesa: `max_varyings = 8` and fragment-shader `max_inputs = 8` (`VC4/vc4_screen.c`), `max_temps = 256`,
  instruction limits 16384 (nominal), one constant buffer of 16 KB, `max_texture_2d_size = 2048`
  (`VC4/vc4_screen.c`). Unit of "8": vectors per GLSL ES limits (`GL_MAX_VARYING_VECTORS`) [I]. `VC4_MAX_TEXTURE_SAMPLERS`
  is defined in a header I did not read; GLES 2 minimum is 8 fragment units (not verified for vc4).
- [S] Only uniform arrays can be indexed dynamically in hardware; other dynamic indexing becomes IF ladders, "expensive on
  this SIMD machine". Mesa vc4 doc, Performance Tips.
- [S] `discard` is implemented as predication: the discard flag turns the colour/Z/stencil writes into conditional writes
  (`uses_discard` / `QPU_COND_ZS` in `VC4/vc4_program.c`), there is no early-out of the remaining instructions [I from the code].
  Using `discard` for the AA fringe therefore costs full shader time on the discarded pixels.
- [S] Early-Z is only enabled for depth func LESS/LEQUAL with depth test on, and only if no stencil z-fail op is used
  (`VC4/vc4_state.c`, `vc4_create_depth_stencil_alpha_state`); a fragment shader writing `gl_FragDepth` disables it
  (`disable_early_z` in `VC4/vc4_program.c`). So a stencil pass that uses `zfail` ops (e.g. INCR_WRAP on z-fail for shadow
  volumes style) loses early-Z; Zinc's stencil-on-pass fill keeps it [I].
- [I] highp in fragment shaders: the QPU arithmetic is 32-bit float ("ZS, 1/WC, Point Size, and Varyings are 32-bit float",
  Guide), and no source I found says Mesa vc4 degrades `mediump`; Mesa vc4 treats all float precision as 32-bit. So the
  "no highp in fragment shaders" constraint of other mobile GPUs does not apply here. This is inference from the Guide, not tested.
  What does exist as a precision issue: `sin`/`cos` accuracy (Anholt fixed `cos(0)` being off enough to move SDL2 output by a
  pixel, https://anholt.github.io/twivc4/2018/10/30/twiv/), and 24-bit-ish SFU functions (rcp/rsq/exp/log) [I, from the QPU
  design; the Guide documents the SFU but I did not read exact accuracy]. Avoid `sqrt/length` per pixel on large geometry, prefer
  squared distance [I].
- [S] Texture units: two TMUs per slice; the Guide notes a lookup should be spread over both; texture coordinates dependent
  on previous lookups stall the QPU unless other threads hide it (Guide, "TMU" text around "if the shader itself distributes
  texture lookups evenly between the two TMUs"). Dependent reads: [I] avoid.

### 1.3 Fill rate in practice

- [S] Peak: 1 Gpixel/s, 1.5 Gtexel/s (Raspberry Pi 3 datasheet, https://components101.com/sites/default/files/component_datasheet/Raspberry%20Pi%203%20Datasheet.pdf, snippet; Guide).
- [S] Real-world: no measured fill figure for vc4 in the pages I could read. The Geeks3D quick benchmark of a Pi 2 GPU gives
  scene scores only (https://geeks3d.com/?p=9051, snippet). An OSMC/Qt forum reply says transparency animations are slow on the
  Pi "OpenGL driver is not optimized very well" (https://forum.qt.io/post/656310, snippet, anecdotal). **No sourced pixels/s for
  blended content.** Measure it on the device (section 9, item 0).

## 2. Multisampling

- [S] The Guide sells 4x MSAA as nearly free *because the tile buffer holds the samples on chip*: "allows 4x multisample
  antialiasing to be used with little penalty in performance or memory consumption" and the multisamples are "resolved to a
  single pixel colour value per pixel" when the tile is written out (Guide, Introduction and tile-buffer chapter). Tile size
  becomes 32x32 pixels (four times as many tiles to bin and draw lists to run).
- [S] Opaque colour can be written to all four samples with one write (`TLB_COLOUR_ALL`); blended colour must read and write
  each sample individually (Guide, "Color Read and Write"). [I] Consequence: 4x MSAA is near-free for opaque, un-blended work and
  can be up to 4x the blend cost for blended work. Zinc's AA fringes are blended: the claim "free" holds only partly.
- [S] How Mesa stores MSAA: MSAA surfaces "are stored as raw tile buffer contents" (`VC4/vc4_resource.c`), the job has
  separate `msaa_color_write` / `msaa_zs_write`, and resolving through a blit is a tile-based load of the raw samples
  (`VC4/vc4_blit.c`, `vc4_tile_blit`). [I] So whether the resolve happens on chip (cheap) or through memory (4x store + load)
  depends on how the dri frontend wires the window surface; I did not verify this. Measure it.
- [S] Supported sample counts: only 4 (`VC4/vc4_screen.c`: `sample_count > 1 && sample_count != VC4_MAX_SAMPLES` is refused).
- [S] Mesa vc4 `glInvalidateFramebuffer` handling: `vc4_invalidate_resource` clears `initialized_buffers` and drops the
  depth/stencil store of the pending job (`VC4/vc4_context.c`), while the Mesa vc4 doc still says invalidate is "unimplemented"
  (doc and code disagree; the doc is probably stale).
- [I] EGL on GBM: the multisampled window surface is requested with `EGL_SAMPLES = 4` in `eglChooseConfig` (config list comes
  from the pipe screen's supported formats; vc4 accepts 4 samples). I did not find a Mesa source statement listing the EGL configs for GBM on vc4;
  check with `eglinfo`/`es2_info`.
- [I] `EXT_multisampled_render_to_texture` is probably **not** exposed: Mesa gates it on the pipe cap `surface_sample_count`
  (`src/mesa/state_tracker/st_extensions.c`: `EXT_CAP(EXT_multisampled_render_to_texture, surface_sample_count)`) and vc4's
  `vc4_init_screen_caps` sets no such cap. I found no vc4 extension dump. Verify with `es2_info | grep multisampled`.
- Alternative [I]: an MSAA FBO + `glBlitFramebuffer` is not available in GLES 2 (needs ES 3 / `NV_framebuffer_blit`); in GLES 2 the
  only route to MSAA on vc4 is the MSAA window-surface config.
- [S] Known bug (kernel, fixed 2019): back-to-back MSAA loads in one job could leave colour or Z undefined
  (https://lkml.iu.edu/hypermail/linux/kernel/1902.0/04957.html). Mesa vc4 doc lists no MSAA bug. Pi OS Mesa 25/26 includes it.
- [I] 16x coverage-mask AA ("Supports 16x coverage mask antialiasing for 2D rendering at full pixel rate", Guide intro) is the OpenVG
  coverage accumulator, reachable only from the Broadcom proprietary stack, not from Mesa GLES 2.

## 3. Stencil, depth, clears, tile-buffer loads and stores

- [S] "Emit `glClear()` for colour and depth even when a draw covers the whole target. The GPU then does a cheap memset rather
  than loading the previous contents from memory." Mesa vc4 doc, Performance Tips. Code: a buffer whose resource has never been
  written is marked cleared without a load; otherwise a not-cleared buffer is loaded (`VC4/vc4_job.c`, `if (!rsc->writes) job->cleared |= ...`;
  RCL setup `if (!(job->cleared & PIPE_CLEAR_COLOR))` -> load). So **clear colour, depth and stencil together as the first call
  of the frame**, before any draw.
- [S] Hardware: the clear values are fixed for the whole frame: "any further clearing during the tile rendering time must be
  accomplished by filling an appropriate primitive" (Guide, tile buffer chapter).
- [S] A clear after draws were queued **flushes the job**: `vc4_clear` prints "Flushing rendering to process new clear" and
  submits (`VC4/vc4_draw.c` near line 618). A clear of depth *only* or stencil *only* on a combined Z24S8 buffer that has contents becomes a drawn quad:
  "Partial clear of Z+stencil buffer, drawing a quad instead of fast clearing" (same file). Both messages appear with `VC4_DEBUG=perf`.
- [I] **Likely culprit for the 184 ms.** The stencil-then-cover method needs the stencil reset after each polygon. If the
  replay does that with `glClear(GL_STENCIL_BUFFER_BIT)` (or a depth clear) between polygons, each clear after the first draw costs a job
  submit, so each polygon becomes its own render job: the whole 800x480 frame is binned, loaded (`color_read`, `zs_read`), shaded for
  its few quads and stored again. 64 jobs times a few ms each is the order of the measured 184 ms. Zinc should check this first
  (section 9). Fix: reset the stencil by the cover pass itself (`glStencilOp(KEEP, KEEP/ZERO, ZERO)` on pass, draw the cover quad
  tight around the polygon bounding box), never with `glClear` inside the frame.
- [S] Also forcing a flush: any read of a resource written by the current job (`vc4_flush_jobs_reading_resource`,
  `VC4/vc4_context.c` line ~76: "We can't flush the texture cache within rendering a tile, so we have to flush all rendering to the kernel so that the next job
  reading from the tile gets a flushed cache"), so render-to-texture followed by sampling, `glReadPixels`, and switching framebuffers,
  all end the job. Avoid FBO ping-pong inside a frame [I].
- [S] Scissor: "If every draw in a frame uses `glScissor()`, the driver can skip setting up tiles outside that area, which saves
  bin setup and load/store bandwidth" (Mesa vc4 doc). Applies to partial UI updates (section 5).
- [S] Stencil/Z are tested/updated in the tile buffer in hardware, QPUs only write Z (Guide). So a stencil pass costs fragment
  shader time only if its shader is expensive; use a trivial shader (or none: colour mask 0) for the stencil pass [I]. A cheap
  stencil-only shader still goes through the QPU for each covered quad [I, no depth-only fast path found].
- [S] Store avoidance: only the colour buffer is stored by default; depth/stencil are stored only if marked "resolve" by the
  job (`job->resolve`, `VC4/vc4_job.c`) - a depth buffer that is never sampled is not written to memory [I from code reading;
  not tested]. `glDiscardFramebufferEXT` support was not verified; `glInvalidateFramebuffer` exists as ES 3 only.
- [S] Hardware erratum HW-2905: early-Z error on full tile load for BCM2835 (Guide errata list), not relevant to the 3B+ path [I].
- [I] Depth used front to back for opaque rects is fine (early-Z, point above). A stencil buffer adds no memory traffic if it stays on chip, since the
  tile buffer carries it.

## 4. Driver CPU overhead

- [S] Draw calls: the kernel validates the command list and shader records of every job (the vc4 DRM driver is a "validating"
  design with relocation checks); this is why submit cost per job is real CPU time; no cycle number found. In the measured run the submit cost was
  29 ms CPU per frame for 64 draw calls (Zinc's own measurement; `docs/reports/raspberry-pi.md`), which is large [I]: suggests
  the submits (jobs) rather than draw calls.
- [S] Shader variants: the fragment shader key includes colour format, depth/stencil enabled, stencil two-sided and full
  writemasks, point/line primitives, MSAA, sample coverage, alpha-to-coverage, logic-op, clip planes **and the full blend state of
  RT0**; the texture key includes format and swizzle, compare mode (`struct vc4_fs_key`, `VC4/vc4_qir.h`; key fill in
  `VC4/vc4_program.c` around line 2770). So toggling blend, stencil enable, depth enable, colour mask or sampler swizzle between
  draws picks (or compiles) a different QPU program. [I] Compile once happens at first use: pre-warm each combination with an
  off-screen frame at start-up so the first map frame does not pay the compiles (the compiler runs NIR passes + QPU scheduling,
  commonly milliseconds each; no source number).
- [S] Vertex buffers: VBOs are untiled and "1 height" (`VC4/vc4_resource.c`). Indices are limited to **16 bits**; a `GL_UNSIGNED_INT`
  index draw triggers "Fallback conversion for %d uint indices" (`vc4_get_shadow_index_buffer`) and the Mesa vc4 doc says 4-byte
  indices are unsupported. Use `GL_UNSIGNED_SHORT` and split above 65535 vertices. GLES 2 core has no uint indices anyway.
- [I] Upload pattern: one `glBufferData` (orphan) per frame of the whole vertex array, then `glDrawElements` with offsets, is the
  cheapest pattern since a changed buffer in use by a pending job forces a copy or a stall; avoid `glBufferSubData` on a buffer the GPU is still reading
  (the driver then waits for the job: `vc4_map_usage_prep` in `VC4/vc4_resource.c` flushes jobs that read the resource).
  Not measured.
- [S] Texture uploads: tiled (T/LT) textures need CPU tile conversion on upload (`vc4_store_tiled_image` in `VC4/vc4_resource.c`; the
  texture is "tiled" unless it is a buffer, MSAA, shared, or flagged linear). Anholt measured upload speedups of +140% to +384% on
  x11perf putimage plus +12% after removing one extra copy (https://anholt.github.io/twivc4/2018/09/07/twiv/); the same page says
  reading back through write-combined memory was "brutally slow". The Phoronix write-up (403, snippet) says the same.
  A texture that is `glTexSubImage`-updated every frame in a format that matches the stored format (`GL_RGBA`/`GL_UNSIGNED_BYTE`
  to RGBA8; `GL_RGB565`/`GL_UNSIGNED_SHORT_5_6_5` to 565) avoids a conversion, other combinations convert [I]. Mesa also keeps "shadow
  textures" for raster-layout textures and prints "Updating %dx%d@%d shadow texture due to ..." when it rebuilds one (`VC4/vc4_resource.c`),
  watch for it with `VC4_DEBUG=perf`.
- [S] Uniforms: fragment/vertex uniform streams are re-emitted when dirty (`VC4/vc4_uniforms.c`); the number of uniforms read is
  in the shader record, not a hard cost. [I] One draw with 64 different rects in a uniform array is bad (dynamic uniform indexing is allowed in hardware for uniform arrays only,
  Mesa vc4 doc) but fine; per-vertex attributes are better.

## 5. Presentation

- [S] Mesa EGL on GBM (`src/egl/drivers/dri2/platform_drm.c`): `EXT_buffer_age` is enabled for the DRM platform, with a per-BO
  `age` counter (`dri2_drm_query_buffer_age`). `KHR_partial_update` is enabled only when the pipe screen implements
  `set_damage_region`; vc4 does not define it (grep over `VC4/vc4_*.c` finds nothing), so it is **not available** on vc4 [I from
  absence]. `EGL_EXT_swap_buffers_with_damage` is a vtable entry (`dri2_swap_buffers_with_damage` in `src/egl/drivers/dri2/egl_dri2.c`), but
  on GBM the page flip is full-frame anyway [I].
  Practical recipe [I]: query `EGL_BUFFER_AGE_EXT` each frame, redraw the union of the damage of the last `age` frames with
  `glScissor`, but still `glClear` the whole target first (a scissored clear of a frame that must keep its contents is a different
  thing: a clear with scissor disables the fast path). Buffer-age-based partial redraw means the tile buffer still has to *load* the
  previous content of the back buffer, which costs a load of the area: only worth it for small damage [I].
- [S] The tile buffer is configured as 32-bit RGBA8888 or 64-bit HDR (Guide); when a tile is written, colour is "converted to
  final format with optional dithering", so a 16-bit scan-out format is converted at store time (Guide, tile buffer chapter) [S].
  The GBM format for scan-out can then be RGB565 if the display plane supports it. Gains: store bandwidth halves.
  [I] Not tested; whether KMS plane and the 7" DSI panel accept RGB565 on `vc4-kms-v3d` is to be checked with `modetest -p`.
  The 24/32-bit tile buffer (32 bpp internal) means fragment cost does not change with 16-bit output, only memory traffic and
  the buffer size.
- [I] XRGB8888 vs ARGB8888: use XRGB; alpha channel not needed, the tile store has less work; confirmed that Zinc already does this.
- [S] Page flip vs blit: GBM surfaces flip the BO that was rendered (no copy); the cost is waiting for the previous flip (vsync).
  No source quantifies the vsync behaviour; `eglSwapInterval(0)` with `drmModePageFlip` still waits for the flip slot because only
  one pending flip is allowed [I]. At 184 ms per frame vsync is irrelevant; at 16 ms it matters (triple buffering via 3 BOs from the GBM surface
  is the default, `gbm_surface_create` uses up to 4 BOs in Mesa) [I].

## 6. Diagnostics on the device

- [S] `VC4_DEBUG` flags in Mesa source (`VC4/vc4_screen.c`): `cl` (dump command lists), `surf` (surface layouts), `qpu`, `qir`,
  `nir`, `tgsi` (shader dumps), `shaderdb` (compile statistics: instruction counts, threads, uniforms, varyings per shader),
  `perf` (prints at performance-related events), `norast` (skip actual hardware execution), `always_flush` (flush after each draw),
  `always_sync` (wait for finish after each flush). `VC4_DEBUG=help` lists them (https://docs.mesa3d.org/envvars.html). The Mesa vc4 doc names only `perf`.
- [S] `perf` messages found in the source: "Flushing rendering to process new clear", "Partial clear of Z+stencil buffer, drawing a
  quad instead of fast clearing", "Flushing batch due to HW-2116 workaround", "Updating WxH@L shadow texture due to ...",
  "Fallback conversion for N uint indices", "YUV-blit src texture offset/stride misaligned" (all in `VC4/vc4_draw.c`, `vc4_resource.c`, `vc4_blit.c`).
- [S] CPU or GPU bound: Mesa vc4 doc, "Performance Debugging": check `top`; if CPU is idle, read `/debug/dri/0/v3d_regs` - the GPU is
  busy when `CT0CA` differs from `CT0EA` or `CT1CA` differs from `CT1EA`; `perf record -e vc4:vc4_wait_for_seqno_begin -a` shows the CPU
  waiting on the GPU. (Path is `/sys/kernel/debug/dri/0/v3d_regs`, needs root and debugfs mounted [I].)
- [S] GPU counters: "Since Linux 4.17 and Mesa 18.1, hardware performance counters are exposed in OpenGL"; capture with apitrace, list with
  `--list-metrics`, replay with `--pdraw=<counter,...>` (Mesa vc4 doc). The counters are the V3D block's 16 hardware counters via a perfmon object
  (https://gbmc.googlesource.com/linux/+/cff088d924df871296412e6b819823f42d1bb9a5/drivers/gpu/drm/vc4/vc4_perfmon.c, snippet); Igalia describes the
  same design for v3d (https://blogs.igalia.com/jasuarez/2021/09/01/v3d-perfcounters/, "AMD_performance_monitor"). The
  Gallium HUD (`GALLIUM_HUD=help`, `GALLIUM_HUD_PERIOD`, https://docs.mesa3d.org/envvars.html) draws fps, CPU load, driver statistics and
  counters, but the HUD is for desktop GL on X11/Wayland; I found no source saying the HUD works from a GBM/KMS EGL app or lists
  vc4 counters. Not verified.
- [I] Per-frame GPU time without a timer query, in order of trust:
  1. `VC4_DEBUG=always_sync` makes each flush wait for the GPU; wall time per frame then equals CPU + GPU serialised. Compare
     with the normal run.
  2. `VC4_DEBUG=norast`: the hardware does not run the commands; the frame time is the pure CPU/driver cost. GPU time ~ normal minus norast.
  3. `glFinish()` before and after `eglSwapBuffers` with `clock_gettime`.
  4. The perfmon counters via apitrace (QPU idle cycles, fragment cycles, tile load/store counts, texture cache misses) once a trace exists.
  5. `vcgencmd measure_clock v3d` before and during the run, to be sure the GPU is at full clock.

## 7. System configuration

- [S] KMS (`dtoverlay=vc4-kms-v3d`) uses CMA for all GPU buffers (Mesa vc4 doc: "Driver memory comes from the CMA pool"; default
  64 MB, suggested `cma=256M@256M` on the kernel command line; `gpu_mem` can be set to 16 when no video decode). Zinc already
  has 256 MB CMA, 115 MB free during the measurement (`docs/reports/raspberry-pi.md`): memory is not the issue.
- [S] `gpu_freq` "sets core_freq, h264_freq, isp_freq, v3d_freq and hevc_freq together"; `v3d_freq` is "the frequency of the 3D
  block"; `core_freq` = "frequency of the GPU processor core" (https://www.raspberrypi.com/documentation/computers/config_txt.html). The doc does not give the Pi 3 default values.
  RetroPie posters (snippets, anecdotal): default config 1400/400/450/300 (arm/core/sdram/v3d) on the 3B+; raising `v3d_freq` has a "massive"
  effect on Quake 3 while `core_freq` has little; one board needed `over_voltage=1`; stable overclocks varied between boards from ~570 to ~615 MHz of `core_freq`
  (https://retropie.org.uk/forum/post/178717 and neighbouring posts, I could not open the pages). Risk [I]: heat, under-voltage and SD-card corruption with a poor supply.
- [S] `temp_soft_limit` (3A+/3B+ only): default 60, can go to 70 "but this might cause instability"; `over_voltage` above 6 needs `force_turbo=1` and may set the
  warranty bit (config.txt page).
- [S] Zinc's own measurement: `get_throttled` 0x50005 and ARM at 600 MHz during all runs (`docs/reports/raspberry-pi.md`), i.e. the supply is
  under-voltage. Under-voltage on a Pi 3 throttles the CPU; whether the firmware also lowers the GPU clocks in the same
  condition is not stated by any source I found [I: probably yes for the core clock - check `vcgencmd measure_clock v3d` under load].
- [I] The CPU still matters for the GPU: the driver builds command lists, the kernel validates them and the QPU binning waits on the CPU's
  submit. With the CPU at 600 MHz instead of 1400 MHz the submit cost (29 ms measured) is 2.3x larger than it would be on a good supply.
  This does not explain a GPU-bound 184 ms, though.
- [I] Governor `performance` helps latency of submits only. "Fake KMS" (`vc4-fkms-v3d`) uses the firmware for display and the Mesa driver for 3D;
  full KMS (`vc4-kms-v3d`) is what is in use. No source compares them for GL speed.
- [S] 16-bit colour: the tile buffer is 32-bit internally, 16-bit only at store (Guide). Gain is memory bandwidth, not shading (section 5).

## 8. Pitfalls reported by other projects (honest status: little found)

- Qt Quick/eglfs: slow animations with transparency on Pi 3/4, "RPi has a weak GPU and OpenGL driver is not optimized very well"
  (https://forum.qt.io/post/656310, snippet). The Qt device spec for the Pi 3 with vc4 (eglfs via KMS/DRM/GBM)
  (https://code.qt.io/cgit/qt/qtbase.git/tree/mkspecs/devices/linux-rasp-pi3-vc4-g++/qmake.conf). Nothing found on MSAA there.
- Kodi (GBM/GLES): on Pi 2/3 the direct-to-plane video path flickers under `vc4-kms-v3d` and the plain EGL path "is a lot slower"
  (https://forum.kodi.tv/showthread.php?tid=361164, snippet). Hardware video acceleration is the Pi's firmware path, not the GL path.
- SDL2 on vc4: Anholt's fix of the `cos(0)/sin(0)` inaccuracy that rotated output by a pixel
  (https://anholt.github.io/twivc4/2018/10/30/twiv/), and the glamor texture-upload slow path on unaligned windows
  (https://anholt.github.io/twivc4/2018/09/07/twiv/).
- Mesa issue 4359: rendering artifacts on OpenJFX graphs on a Pi 3 (VC4 V3D 2.1) with the FKMS driver (https://gitlab.freedesktop.org/mesa/mesa/-/issues/4359, snippet only).
- flutter-pi, LVGL, Kivy, pygame, Chromium, RetroArch: searches returned nothing usable for Pi 0-3 + vc4 + 2D. Generic shader-compile jank
  on first use applies to every GL stack that builds programs lazily (https://files.flutter-io.cn/flutter-design-docs/Jank_in_Flutter.pdf, snippet); the
  vc4 state-dependent variant mechanism (section 4) is the vc4-specific form of it.

## 9. What to try first in Zinc

Ranked by (expected gain) / (effort) for the measured case. Every item says what to measure to confirm it.

0. **Measure first, 15 minutes, no code.** On the Pi run hero Navigation with `VC4_DEBUG=perf` and read stderr; then with `VC4_DEBUG=norast`,
   `VC4_DEBUG=always_sync`, and `VC4_DEBUG=shaderdb` (instruction count of each Zinc fragment shader). Also `vcgencmd measure_clock v3d`
   and `get_throttled` during the run, and `/sys/kernel/debug/dri/0/v3d_regs` for busy state.
   Confirm: a flood of "Flushing rendering to process new clear" or "Partial clear of Z+stencil" lines means item 1; fragment shader lengths over
   ~100 QPU instructions mean item 3.
1. **No `glClear` (or readback, or FBO switch) after the first draw of the frame; one full `glClear(COLOR|DEPTH|STENCIL)` at the start; reset the
   stencil with stencil ops in the cover pass.** Expected gain: potentially the whole factor 10-100 if the replay clears stencil per
   polygon (inference, section 3). Cheapest: grep `glClear`, `glReadPixels`, `glBindFramebuffer`, `glFinish` in `runtime/gl_replay.cpp` and
   `plugins/display-gl/src/*.cpp`. Confirm: jobs per frame (count of "Flushing" perf lines per frame) drops to 1 and frame time follows. Cost: small.
2. **Tight cover geometry and scissor.** Draw each polygon's cover quad as the bounding box of the polygon (not the screen, not a tile), and
   `glScissor` to that box for both stencil and cover passes. Confirm: `norast` unchanged, normal run faster; count overdraw by drawing every fragment with
   additive 1/255 in a debug build and reading back (once, off the timed path). Cost: small if the replay has the bounds.
3. **Make the fringe cheap.** Replace distance-in-fragment-shader coverage by geometry: add a one-pixel feathered border of triangles with a
   per-vertex alpha (one varying, one `mul`), no `discard`, no `length`. Or keep the SDF but drop `sqrt` (use squared distance with `smoothstep` on squared value),
   no dependent branches. Confirm with `VC4_DEBUG=shaderdb` instruction counts before/after and the frame time. Cost: medium. Gain: proportional to
   instructions per fragment [I].
4. **Opaque first, blending off.** Draw opaque fills with `glDisable(GL_BLEND)` and depth write front to back (QPU blending is software, a
   tile-buffer read and write per fragment, Guide), blended fringes last. Confirm: shaderdb shows a shorter shader for the no-blend variant and the frame
   time drops. Cost: small (the replay already orders opaque rects front-to-back).
5. **Reduce variant churn and pre-warm.** Count distinct (blend, depth, stencil, colour mask) combinations per frame (section 4 key list) and draw
   in an order that changes state rarely; render one throw-away frame of every screen at start-up. Confirm: first-frame time vs steady-state
   time, `VC4_DEBUG=shaderdb` printing a compile per new variant at run time. Cost: small.
6. **Try 4x MSAA instead of AA fringes for the map** (EGL config with `EGL_SAMPLES=4`; fringes off; opaque draws). Hardware writes all four samples with one TLB
   write for opaque colour, so the map (mostly opaque flat colour) may be cheaper than fringes, and the stencil cover passes still work per sample.
   Risks: 32x32 tiles = 4x tiles to bin; blended draws cost up to 4x; resolve path through memory unknown; no `EXT_multisampled_render_to_texture`.
   Confirm: compare frame time of the same screen with and without, and `eglinfo` for a 4-sample config. Cost: medium (config path + replay mode).
7. **Raise the GPU clock.** `v3d_freq` (and `core_freq`) in `config.txt` after fixing the supply. Expected gain roughly proportional to the clock for a shader-bound frame
   [I] (RetroPie anecdotes say "massive" for Quake 3). Confirm: `vcgencmd measure_clock v3d` and frame time. Cost: trivial, risk: heat and instability on bad supply
   (do 3 A first, `get_throttled` must be 0x0).
8. **Partial redraw for UI screens** (not the map): `EGL_BUFFER_AGE_EXT` + scissor, since `KHR_partial_update` does not exist on vc4. Confirm: the UI screens' frame time
   with 5% damage versus full; check that the load of the previous content does not eat the gain. Cost: medium. Gain on the Navigation map: none (the whole map changes).
9. **RGB565 scan-out** (halves store traffic, section 5). Confirm with `modetest -p` that the plane takes RG16, then measure. Expected gain small for a shader-bound frame; cost: medium (format negotiation on the 7" panel).
10. **Fall back by content**: keep the software bands for the map (43 ms measured on 4 cores) and use the GL path for UI screens, until items 1 to 4 show a
    better number. Confirm: the UI screens on GL are faster than on the bands (not yet measured, see `docs/reports/raspberry-pi.md`). Cost: small (a per-screen
    renderer choice).

## 10. Things I could not verify

- Sustained vc4 fill rate in pixels/s for blended, varying-heavy shaders: no source found; peak only.
- Whether the Mesa 25/26 on the device exposes `EXT_multisampled_render_to_texture`, `GL_EXT_discard_framebuffer` and which EGL sample configs the GBM display lists
  (inference from source; run `eglinfo`/`es2_info`).
- Whether the dri frontend resolves a multisampled GBM window surface on chip or through memory.
- Whether GALLIUM_HUD works on a GBM/KMS EGL application and lists vc4 counters.
- Per-primitive binning cost, and the cost in ms of a job submit (load + store of 800x480) on the 3B+: not in any source; measure by `always_sync` with an empty frame of N clears.
- The RetroPie/Phoronix/Kodi/Qt items are search snippets only (pages blocked or not opened), so their numbers are second-hand.
