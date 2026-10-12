# 2D rendering on GLES 2 tile-based GPUs: how production renderers do it, and a fast path for Zinc

Date: 2026-10-12. Research only, no code changed. Question: the GL replay (`runtime/gl_replay.cpp`) takes 184 ms per frame on a
Raspberry Pi 3B+ (VideoCore IV, Mesa vc4, GLES 2.0, 800x480) for the vector map (64 draw calls, 6313 quads) and is GPU-bound, while the
software bands take 43 ms (`docs/reports/raspberry-pi.md`, last section). How do other renderers get speed on this class of GPU
(VideoCore IV, Mali-400/450, Adreno 2xx/3xx, PowerVR SGX), and what should Zinc change?

Convention: **[S]** = sourced (URL given), **[I]** = inference (mine, not stated by a source). No benchmark number below is mine; every
number comes from a cited page or from `raspberry-pi.md`.

Pages that could not be used: Khronos wiki "Buffer Object Streaming" (HTTP 403 on both hosts), the Arm Mali "Application Developer Best
Practices" guide (page returned only a title), the PowerVR architecture "hidden surface removal" page (404), the Rive renderer blog post (not
found by search), Skia's `AAConvexPathRenderer.cpp` (only the header was fetched), `maplibre-gl-js` current shader paths (404; the
Mapbox GL JS v1.13.0 files were read instead). Skia "DMSAA", Tangram, Kivy, Chromium's damage policy and Google Maps lite were not found
in any fetched source and are not described.

## 0. What Zinc does today (read from the code)

- Vertex `V` is 60 bytes (`x y u v bx by bw bh r p1 mode grad`, two RGBA8, `z`), 4 per quad, 240 bytes per quad, no index reuse across
  quads except a static quad index buffer (`gl_replay.cpp` lines 27, 192, 218-228). 6313 quads is about 1.5 MB of vertices per frame
  streamed with `glBufferData(..., GL_STREAM_DRAW)` per flush. [I: arithmetic from the struct]
- One uber fragment shader (`gl_replay_shaders.h`, `FS`): modes selected by float comparisons on a varying (`mode < 0.5`, ...), rounded-box
  SDF with `length`, `max`, gradient mixing with `floor`, `discard` in the EDGE and STROKE modes, sampler reads. No `precision` statements
  appear in the shader file (grep), so fragment precision is whatever the `zgl_program` prelude sets. [read from the code]
- STROKE: one quad per segment; the fragment shader computes the capsule distance with `seg()` (a `dot`, `clamp`, `length`) and discards
  pixels already covered by the previous or next segment (`FS` lines ~54-64). [read from the code]
- POLY: 7 draw calls per batch of up to 64 shapes: stencil fan, then fringe quads drawn several times (`edge_draw`), then cover quad,
  then a stencil clear (`poly_flush`, lines 668-730). Fringe quads carry the edge data as varyings and the fragment shader measures the
  distance to the edge segment. No MSAA is requested; `kms.cpp` lines 164-170 only probes EGL configs with samples >= 2 and prints them.
- Opaque rectangles are drawn front to back with a depth buffer (`occlusion_pass`, `depth_of`). That part follows the standard advice below.

## 1. Antialiasing strategies and their cost

### 1.1 The three families

1. **Multisampling (MSAA) with plain triangles.** Cheapest shader (flat colour). Cost is in the tile buffer size and tile count.
   - Mesa vc4: "chopping the screen into 64x64 (non-MSAA) or 32x32 (MSAA) tiles" so MSAA quarters the tile area and increases binning
     and vertex work; the driver says tiling "increas[es] the cost of vertex processing". [S] https://docs.mesa3d.org/drivers/vc4.html
   - The multisample resolve on a tiler happens in the tile buffer; `EXT_multisampled_render_to_texture` exists precisely to avoid an
     explicit resolve and "saves a significant amount of bandwidth" (Imagination's description). [S]
     https://docs.imgtec.com/reference-manuals/open-gl-es-extensions/html/topics/GL_EXT/multisampled-render-to-texture.html
   - I found no measured 4x MSAA cost on vc4. [not found] Whether VC4 shades once per pixel per triangle with 4 coverage bits is a
     hardware fact I did not verify. [I]
2. **Analytic / geometric coverage (vertex AA).** The mesh gets an extra strip about 1 px wide whose outer vertices have alpha 0; the
   rasterizer interpolates the ramp, the fragment shader multiplies colour by one varying. NanoVG does this: `NVG_ANTIALIAS` adds a
   fringe as `GL_TRIANGLE_STRIP`, the stroke mask is `min(1.0, (1.0-abs(ftcoord.x*2.0-1.0))*strokeMult) * min(1.0, ftcoord.y)`, vertices
   are only `x,y,u,v`. [S] https://raw.githubusercontent.com/memononen/nanovg/master/src/nanovg_gl.h
   NanoVG's README says "If you're using MSAA, you can omit this flag" (the fringe). [S] https://raw.githubusercontent.com/memononen/nanovg/master/README.md
3. **Distance in the fragment shader (SDF).** Exact, resolution independent, but ALU per covered pixel and the quad must cover the
   edge neighbourhood. Flutter's Impeller docs state SDF rendering "puts more demand on the GPU" and that is why SDFs default to on for
   desktop and off on mobile ("Flutter supports older mobile phones"). [S] https://docs.flutter.dev/perf/antialiasing

### 1.2 Who uses what

| Renderer | AA choice | Source |
|---|---|---|
| NanoVG | Geometric fringe (`EDGE_AA`), stencil-then-cover for concave fills, convex fills skip stencil; `discard` only on the stroke-threshold path | [S] nanovg_gl.h above |
| femtovg (Slint's GL renderer) | NanoVG port, lists an "OpenGl ES2 backend"; Slint's docs say its "Text and path rendering quality [is] sometimes sub-optimal" | [S] https://github.com/femtovg/femtovg , https://docs.slint.dev/latest/docs/slint/guide/backends-and-renderers/backends_and_renderers/ |
| Slint software renderer | The recommended path without a GPU: "Runs anywhere, highly portable, and lightweight", supports partial rendering; no rotation/scaling, no drop shadows, no `border-radius` with clip | [S] Slint docs above |
| Flutter Impeller | 4x MSAA "on desktop and mobile ... for all rendering calls", relies on tiled GPUs to make it cheap; SDF is an opt-in on mobile | [S] https://docs.flutter.dev/perf/antialiasing |
| Impeller path fills | CPU tessellation (libtess2) was the start, "can be CPU-expensive"; convex fills get specialised paths; stencil-then-cover for concave "trading CPU tessellation for an extra draw call and some stencil overdraw"; AA is deferred to MSAA resolve | [S] https://github.com/flutter/flutter/issues/123671 |
| Impeller GLES | checks `GL_EXT_multisampled_render_to_texture` | [S] https://api.flutter.dev/impeller/capabilities__gles_8cc_source.html (name only; how it is used was not read) |
| Skia Ganesh | Tessellating path renderer: stencil-then-cover, "no analytic antialiasing, so it needs a render target with MSAA or mixed samples"; the CPU can triangulate the inner fan for simple paths and stencil only the curves; separate AA-convex renderer exists | [S] https://skia.googlesource.com/skia/+/main/src/gpu/ganesh/ops/TessellationPathRenderer.cpp , https://skia.googlesource.com/skia/+/chrome/m115/src/gpu/ganesh/ops/TessellationPathRenderer.h , header of https://skia.googlesource.com/skia/+/chrome/m115/src/gpu/ganesh/ops/AAConvexPathRenderer.h (its mechanism not read) |
| Skia Graphite | "relies on MSAA where it can", but MSAA is "often limited to 4 samples" and poor performance on older integrated GPUs "often prevents its use"; then falls back to "CPU path rasterization using an atlas for caching" | [S] https://blog.google/chromium/introducing-skia-graphite-chromes/ |
| Qt Quick (scene graph) | Rectangles with `antialiasing` get extra edge triangles ("fake an antialiased edge", `QSGSmoothColorMaterial`), not MSAA; MSAA is opt-in through the surface format "at some performance cost" | [S] https://lists.qt-project.org/pipermail/interest/2015-January/015042.html , https://code.qt.io/cgit/qt/qtdeclarative.git/tree/src/quick/scenegraph/qsgdefaultrectanglenode_p.h?h=5.7 (forum-level source, 2015) |
| Qt Quick backend choice | Software adaptation "uses the raster paint engine"; it is the default only when OpenGL and Vulkan are disabled in the build; switch with `QT_QUICK_BACKEND=software`. The page does not say which to use on a Pi | [S] https://doc.qt.io/qt-6/qtquick-visualcanvas-adaptations.html |
| Rive renderer | GL tiers: pixel local storage, fragment shader interlock, read/write-texture/`EXT_shader_pixel_local_storage`, and MSAA "for truly minimal drivers"; a non-zero `msaaSampleCount` forces MSAA; on Qualcomm PLS is disabled because framebuffer fetch is slow and 4x MSAA is used. Docs do not mention ES 2.0 or WebGL 1; an old README of the repo said "OpenGL (ES 2.0 compliant)" for "older mobile devices" and was "experimental" | [S] https://rive.app/docs/runtimes/cpp/renderers , https://skia.googlesource.com/external/github.com/rive-app/rive-cpp/+/6f378ca55373219b370bb6ef4c0ee462c2f3432f , the old README text is quoted by a search result of rive-cpp `renderer/README.md` (the fetched revision did not show it) |
| Rive large paths | "interior triangulation": subdivide curves, draw the outer curves with the PLS algorithm and the interior as non-overlapping triangles, which "skip raster-ordered synchronization" and remove overdraw | [S] https://skia.googlesource.com/external/github.com/rive-app/rive-cpp/+/0b1562d6e58b6d4c9f3caaf09b9e139732f673ea%5E%21/ |
| WebRender | Everything is a quad; vertex AA was "the simplest approach" for paths in the design notes; per-edge quad AA is done in the shader with an SDF; software fallback (SWGL) does AA differently | [S] https://github.com/servo/servo/wiki/Webrender-Overview , https://bugzilla.mozilla.org/show_bug.cgi?id=2015400 , https://bugzilla.mozilla.org/show_bug.cgi?id=2015805 |
| LVGL | OpenGL ES draw unit needs ES 2.0; "excellent performance for static elements thanks to texture caching"; a user report: Raspberry Pi 3B, 800x480, DRM+EGL, about 389 fps with it vs about 309 without (one author, not reproducible); another user on a Mali-G31 found only square-cornered fills, gradients and layers are accelerated, everything else falls back to software | [S] https://docs.lvgl.io/9.5/integration/embedded_linux/draw_opengl.html , https://forum.lvgl.io/t/what-is-the-performance-of-lvgl-v9-3-opengl-es-rendering/21917 , https://forum.lvgl.io/t/how-to-improve-the-fps/24297 |
| Cairo-GL | Dropped: "Cairo versions >= 1.17.8 dropped all GL render backends"; the upstream reason was not found. Earlier it was labelled "experimental" and disabled by distributions | [S] https://patchwork.yoctoproject.org/comment/17071 , https://bugs.archlinux.org/task/56580 (reason **not verified**) |
| ThorVG GL | v1.1 notes mention GPU batching and pipeline optimisations; stencil/MSAA internals not found | [S] https://www.thorvg.org/post/thorvg-v1-1-rising-the-standard (internals not verified) |
| Kivy | not researched (no source fetched) | |

### 1.3 What this says about low-end GPUs

- Two of the largest teams (Skia/Graphite, Impeller) lean on 4x MSAA but both document the weak point: older integrated GPUs, and
  keep CPU or SDF alternatives. [S] Graphite blog, Impeller doc above.
- The renderers that target ES 2.0 hardware on purpose (NanoVG/femtovg, Qt Quick's rectangle node, LVGL) use vertex-geometry AA, i.e.
  a trivial fragment shader. [S/I: the pattern is read from the sources above; "on purpose" is my reading]
- Several projects ship a CPU renderer for the same class of device and treat it as first class (Slint "Software", Qt "software"
  adaptation, Graphite's "CPU path rasterization using an atlas", LVGL's fallback to software for the operations the GPU unit lacks).
  [S] links above. This is consistent with the Pi result in `raspberry-pi.md` (software 43 ms vs GL 184 ms).

## 2. Polygon filling and how map renderers do it

### 2.1 Options

| Technique | Cost model | Wins when | Loses when |
|---|---|---|---|
| Stencil-then-cover (Zinc today, NanoVG for concave, Ganesh tessellation, Impeller concave) | 2 to 4 passes; fill-rate doubles because the shape is rasterised twice plus a cover quad; needs a stencil buffer and breaks batching because state changes between passes | Concave or self-overlapping shapes, curves, cheap CPU, shapes that change every frame | Many small simple shapes, weak fill-rate GPU, shapes that need an AA fringe (extra passes) |
| CPU triangulation (earcut, libtess2, monotone) into cached meshes | CPU once per shape; GPU draws one pass; mesh can be a vertex buffer reused with a matrix | Static geometry under a transform (maps), many shapes sharing one program | Geometry that changes shape every frame, pathological input |
| CPU coverage mask in an atlas (Graphite's CPU fallback; Zinc's old `PolyTile`) | CPU raster + upload; GPU draws a textured quad | Small shapes, icons, anything repeated; high-quality AA | Large shapes (upload), shapes that move with subpixel offsets unless the mask is snapped |

- earcut: "modified ear slicing algorithm, optimized by z-order curve and spatial hashing"; triangulated 119,680 real map polygons
  (1.9M vertices) in about 445 ms on an M1 Pro (that is about 3.7 us per polygon on that CPU; a Pi 3B+ will be several times
  slower, **not measured**); it "does not guarantee a correct triangulation on arbitrary input" and can leave T-junctions, harmless for
  rendering. [S] https://github.com/mapbox/earcut
- Impeller replaced libtess2 first for convex shapes and kept stencil-then-cover for concave ones, and notes the stencil-then-cover trade
  is "an extra draw call and some stencil overdraw". [S] flutter issue 123671 above.

### 2.2 Map renderers (Mapbox GL JS v1.13 as the reference)

- **Fills:** the bucket holds an index buffer (triangles from earcut, built on the worker) and a second index buffer for outlines;
  per tile only a position matrix and uniforms change (`translatePosMatrix(coord.posMatrix, ...)`). An opaque fill (no pattern,
  alpha 1, opacity 1) goes to the **opaque pass with depth read/write**; everything else goes to the translucent pass with depth
  read only. The AA "outline pass" is a separate `gl.LINES` draw using the secondary index buffer, only when `fill-antialias` is on,
  and only drawn in the translucent pass. Tile clipping uses stencil (`stencilModeForClipping`). [S]
  https://raw.githubusercontent.com/mapbox/mapbox-gl-js/v1.13.0/src/render/draw_fill.js
  - So the common map trick is: **fill interiors are non-AA triangles (opaque, depth-tested), edges get a separate cheap line pass.**
    Mapbox leaves the interior unantialiased and relies on the outline pass for smoothness. [S/I: structure is sourced; "relies on the
    outline for smoothness" is my reading of the `fill-antialias` option]
- **Lines:** quads extruded in the vertex shader from a per-vertex normal packed in bytes (`a_data.xy` offset by 128, miter normals up to
  126 for a miter limit of 2.0), with varyings `v_normal`, `v_width2`, `v_gamma_scale`. [S]
  https://raw.githubusercontent.com/mapbox/mapbox-gl-js/v1.13.0/src/shaders/line.vertex.glsl
  The fragment shader is one distance and one **linear** ramp, not a smoothstep:
  `dist = length(v_normal)*v_width2.s; blur2 = (blur + 1.0/dpr)*v_gamma_scale; alpha = clamp(min(dist-(v_width2.t-blur2), v_width2.s-dist)/blur2, 0.0, 1.0);`
  [S] https://raw.githubusercontent.com/mapbox/mapbox-gl-js/v1.13.0/src/shaders/line.fragment.glsl
  Joins and caps live in the geometry (extra vertices), not in neighbour tests in the fragment shader. [S: packing; I: the comparison]
- **What is cached:** vertex and index buffers per tile, built once off the render thread; per frame only matrices and uniforms (above).
  Qt's scene graph does the same for UI: "This vertex buffer is retained between frames ... as long as nodes are not being added or
  removed, rendering the list is effectively for free." [S] https://doc.qt.io/qt-6/qtquick-visualcanvas-scenegraph-renderer.html
- Tangram and Google Maps lite: no source found. [not found]

### 2.3 What that means for a renderer that receives a new command list every frame [I]

The map is static geometry in world space, but Zinc receives it as device-space points that change at each frame (the camera moves
while driving). A cache keyed by the content of the points never hits while the camera moves; Zinc's old `PolyTile` cache has the same
property ("a shape that does not change costs one upload and moves for free" only for pure translation).
Three ways out, in increasing change:
1. Accept per-frame CPU tessellation but make it cheap (earcut on small polygons, parallel on 4 cores, off the GL thread). Only valid
   if the CPU cost is small against the 184 ms; **needs measurement** on the Pi.
2. Key the cache by a **stable shape id + a 2D affine** (a new optional field on POLY/STROKE commands, or a `MESH` command with a
   transform). `docs/reports/gpu-renderer-design.md` already plans a retained `MESH` in phase 4. The program (the map code in
   `examples/`) then submits the tile's geometry once and a matrix per frame, like Mapbox.
3. Detect it in the replay: hash the polygon after subtracting its first point (translation-invariant) and a rotation/scale signature;
   same-shape-different-position hits. Works for pans, not for rotation or zoom, which is what a driving map does.

## 3. Overdraw control on tilers

- **Front-to-back opaque with depth:** Qt Quick: "Opaque primitives are rendered in a front-to-back manner with glDepthMask and
  GL_DEPTH_TEST enabled ... opaque primitives do not require GL_BLEND to be enabled, which can be quite costly." [S]
  https://doc.qt.io/qt-6/qtquick-visualcanvas-scenegraph-renderer.html
  Graphite: Ganesh "never utilized the depth testing capabilities of graphics cards" and so suffers overdraw; Graphite gives each draw a
  z value. [S] https://blog.google/chromium/introducing-skia-graphite-chromes/ Zinc already does this for opaque rects; extending it to
  opaque POLY interiors is the missing piece. [I]
- **`discard` and early-Z:** an Arm deck says a fragment can be rejected by early depth only if the shader does not use `discard`,
  does not write depth, and alpha-to-coverage is off (secondary, via a search summary of a SlideShare copy). [S/secondary]
  https://www.slideshare.net/OwenWu/mobile-graphics-optimization-guides
  Imagination: "Applications should avoid the use of the discard operation in the fragment shader ... using it will not improve
  performance and negates some of the benefits of [tile based deferred rendering]"; alpha test delays depth writes; order draws
  opaque, alpha-tested, blended. [S] https://docs.imgtec.com/starter-guides/powervr-architecture/html/topics/rules/do-not-use-discard.html
  Zinc's EDGE and STROKE modes use `discard` on every fragment of the fringe quads. [read from the code] Whether vc4 loses early-Z
  to `discard` was not found in a source. [not found; I: it likely does, as on other hardware]
- **PowerVR vs the others:** PowerVR is tile-based **deferred** (hidden surface removal removes overdraw of opaque geometry whatever
  the order); Mali and VideoCore IV are tile-based **immediate** (they need front-to-back order or early-Z to avoid shading hidden
  pixels). The HSR page was not reachable; the statement "HSR only works for opaque geometry, so as soon as you activate blending you
  will lose" is an Imagination staff forum reply. [S/secondary] https://forums.imgtec.com/t/hidden-surface-removal-for-alpha-blended-fragment-under-opaque-one/1585
  The VC4/Mali classification is from my own knowledge. [I]
- **Why stencil passes double the fill:** each shape is rasterised for the stencil (no colour), then again for the fringe and the cover;
  Impeller's maintainers name the same cost ("an extra draw call and some stencil overdraw"). [S] flutter issue 123671. The stencil
  test also prevents merging with other work into one draw call. [I]
- **Scissor on vc4:** "If all draws use glScissor() on part of the screen, tiles outside that area are skipped" and clear instead of
  load; `glInvalidateFramebuffer` is listed as unimplemented. [S] https://docs.mesa3d.org/drivers/vc4.html
- **CPU-side occlusion:** WebRender removes primitives hidden by an opaque one per tile before submitting ("you can remove the white
  background since it's covered by the opaque brown element"). [S] https://github.com/servo/servo/wiki/Webrender-Overview
  Zinc's `culled`/`vis` list in `gl_replay.cpp` already does a form of this for rectangles.

## 4. Batching without instancing

- **Fewer, bigger draws:** Qt's guideline: "batches should be fewer than 10 and at least 3-4 of them should be opaque"; clipping breaks
  batching; batching needs 16-bit indices. [S] Qt scene graph page above. WebRender's first design needed about 2 to 3 draw calls per
  frame by drawing everything as quads with one primary shader; it uses instancing "where available". [S] Webrender-Overview above.
- **Index type:** vc4: use `GL_UNSIGNED_SHORT`; `GL_UNSIGNED_INT` needs a shadow copy. [S] https://docs.mesa3d.org/drivers/vc4.html
  Zinc's `MAXQ = 8192` quads x 4 = 32768 vertices fits 16-bit indices. [read from the code]
- **Vertex size:** the 60-byte vertex is the largest single cost I can see on the CPU/bandwidth side (inference below); NanoVG's is 16
  bytes (`x,y,u,v` floats). [S] nanovg_gl.h. Mapbox packs positions in a short and normals in bytes. [S] line.vertex.glsl above.
  Imagination: "Each varying requires additional space in the parameter buffer, and additional processing time to perform
  interpolation" and recommends packing two `vec2` into one `vec4`. [S] https://docs.imgtec.com/performance-guides/graphics-recommendations/html/topics/demystifying-precision.html
  Zinc passes five varyings (`v_pos v_box v_par v_c1 v_c2`, 20 floats) to every fragment of every mode. [read from the code]
  A tiler writes the transformed vertices and varyings to a parameter/binning buffer and reads them again per tile (Mesa: tiling
  "increas[es] the cost of vertex processing"), so the cost of fat vertices is paid in the vertex/binning stage, not only on the bus. [S/I]
- **Buffer updates:** NanoVG uploads once per flush with `glBufferData(GL_ARRAY_BUFFER, n*sizeof, verts, GL_STREAM_DRAW)`, i.e. the
  re-specify (orphaning) pattern, and one uniform array per call. [S] nanovg_gl.h. Zinc does the same (`flush`, `stencil_draw`, `edge_upload`).
  The Khronos streaming page could not be fetched; the Mesa vc4 doc lists no streaming advice. [not found]
- **Atlases and state:** LVGL's GL draw unit relies on a texture cache; Qt groups by material state; Graphite's fallback keeps an atlas.
  [S] links above. Zinc already atlases glyphs and tiles.
- **Uniform updates:** vc4 only indexes uniform arrays in hardware; other dynamic array indexing becomes an IF ladder where "we
  probably have to execute every branch". [S] Mesa vc4 doc. Zinc's gradient path indexes `u_gc[8]`, `u_go[8]`, `u_cv[8]` in loops
  (`FS`); constant-bound loops that Mesa can unroll count as constant indexing. [S/I]

## 5. Shader cost

- Use `lowp/mediump` everywhere except positions/matrices and transcendental math (Imagination). On PowerVR Rogue `lowp` and `mediump`
  are both FP16. [S] https://docs.imgtec.com/performance-guides/graphics-recommendations/html/topics/demystifying-precision.html
  VC4 has no 16-bit ALU, so mediump is expected to give no speed-up there; I did not find a vc4 source. [I]
  Whether `highp` is available in fragment shaders on vc4 and Mali-400: the GLES 2 spec makes it optional; Mali-400 does not support
  it (my knowledge, unverified). Zinc's shader sources set no precision; check the prelude (`zgl_program`) and `GL_FRAGMENT_PRECISION_HIGH`.
  [I]
- Fewer varyings and less ALU per fragment: Imagination says varyings are cheaper than the same work per fragment when the value can
  be computed in the vertex shader (search summary of the same guide). [S/secondary]
- Branching on a varying (`if (mode < 0.5) ...`): uniform control flow is cheap on desktop, but on vc4 branches are executed with
  predication and the uber shader has more live registers; I found no vc4 source. **The fix is cheap regardless**: one program per
  mode, mode known at link time. [I]
- `discard`: see section 3.
- Lookup textures instead of math: a 1D ramp texture for gradients and for edge coverage. Mapbox does the opposite for lines (math in
  the fragment shader, but just one subtraction, one divide and a clamp); NanoVG uses one multiply of interpolated fringe values. Ramp
  textures for gradients are the standard approach in Skia (gradient textures) and Qt (`QSGGradientCache`), but I did not fetch a source.
  [not found]
- Tools on the device: `VC4_DEBUG=perf`, hardware counters through apitrace (Linux 4.17+, Mesa 18.1+), `perf` event
  `vc4:vc4_wait_for_seqno_begin` to see CPU stalls on the GPU, `/debug/dri/0/v3d_regs` for GPU busy. [S]
  https://docs.mesa3d.org/drivers/vc4.html

## 6. Partial redraw

- `EGL_EXT_buffer_age` tells the app how old the back buffer is; `EGL_KHR_partial_update` tells the driver which region will change;
  `EGL_KHR_swap_buffers_with_damage` tells the compositor. Weston's commit describes the roles. [S]
  https://code.tokarch.uk/mainnika/weston/commit/df2095fa35fe84e4ebc30754dd9f25e50bd1aa47
- **On tilers:** Mesa's Lima (Mali-400/450) developers found Utgard "has to reload the render target when buffer_age is enabled, which
  costs more than a redraw", disabled `EGL_EXT_buffer_age` there and wanted `EGL_KHR_partial_update`, which "means [the driver] can avoid
  fetching unchanged tiles into the tile buffer and subsequently writing them out". [S]
  https://gitlab.freedesktop.org/mesa/mesa/merge_requests/658 , https://gitlab.freedesktop.org/mesa/mesa/merge_requests/859 ,
  https://lists.freedesktop.org/archives/lima/2018-July/000007.html
  Whether vc4 exposes either extension: not found. [not found]
- The vc4 doc recommends **clearing** the buffer so the load is skipped, and `glScissor` to skip tiles. [S] Mesa vc4 doc. This
  conflicts with buffer-age style reuse: reusing the previous contents means a load. [I]
- Retained layers / render-to-texture: every FBO switch on a tiler resolves tiles (Zinc's own design doc already says "each costs a
  tile flush": `gpu-renderer-design.md` line 171). LVGL's draw unit caches textures ("excellent performance for static elements"). [S] LVGL docs. Slint's software renderer
  does "partial rendering". [S] Slint docs. Chromium/Flutter decisions were not found. [not found]
- For this project: the map changes every pixel while driving ("the whole map changes at every frame while driving, so damage tracking
  saves nothing", `raspberry-pi.md`). Damage only helps ordinary UI screens. [read from the report]

## 7. Rounded rectangles, shadows, gradients

- SDF in the shader is the Zinc/Flutter-desktop approach; Flutter keeps it off on mobile by default. [S] Flutter AA doc.
- Geometry-based rounded corners: Qt's Rectangle builds the rounded outline as extra triangles with a smooth edge material
  (above); LVGL's GL unit accelerates only square-cornered fills, gradients and layers and falls back to software for the rest (user
  report on a Mali-G31). [S] forum links above.
- Nine-patch/blurred shadows from an atlas, gradient ramp textures: no fetched source documents these for GLES 2; they are standard
  techniques in Qt (shadow effects are textures) and Skia (blur mask filters) but I did not verify. [not found]
- A rounded rectangle needs the SDF only in its four corners. Zinc already has a `split` mode (cheap quads for interiors, `bands`,
  `solid_and_bands`). [read from the code]

## 8. Text

- Zinc: A8-style glyph atlas (`TEXT_M` reads `.r`), one quad per glyph, `ATLAS = 1024`, glyph slot cache. Nothing found in any
  fetched source contradicts this; it is the usual design. Per-glyph state is already avoided (`use_tex` flushes only when the
  texture changes). [read from the code]
- On a tiler the text pass is cheap if the glyph quads are batched in one draw with the other `FILL` quads; the only cost is the
  fat vertex (section 4). [I]

## 9. A GLES 2 fast path for Zinc

Goal: make the GL path clearly faster than the software bands on VideoCore IV for the map and for ordinary screens, without a visible
loss of quality. The software frame is about 43 ms, the GL frame 184 ms, and the GL process is GPU-bound (11% of one core).

### 9.0 First, measure where the 184 ms goes (1 day) [I]

No timer query on this driver (`raspberry-pi.md`), so use ablation with a forced `glFinish()` after each phase (or the same run with a
phase disabled), plus the vc4 counters:
- run the map with only (a) opaque rects/text, (b) +STROKE, (c) +POLY batches; report ms per frame for each;
- `VC4_DEBUG=perf` and apitrace with counters (Mesa vc4 doc above): look for the QPU-cycle and TMU stalls of the FS and the number of
  tile loads;
- `perf stat` / `v3d_regs` to confirm the GPU is the bottleneck (already shown by 11% CPU).
This tells which of the next options is worth doing first. Everything below is a hypothesis until this is done.

### 9.1 Ranked options

| # | Option | Expected gain | Effort | Pixel risk |
|---|---|---|---|---|
| A | Auto-select the renderer per frame: if the frame has more than N POLY/STROKE commands on a GLES 2 tiler, use the software bands; GL for UI-only frames | Guaranteed: the map goes back to 43 ms; UI screens keep the GL path (whose Pi cost is **unmeasured**) | 1 to 2 days | None (software is the reference) |
| B | STROKE as extruded strip meshes (vertex normal + one linear ramp in the fragment shader, MapLibre-style), no `discard`, no neighbour tests | Large on stroke-heavy maps if strokes dominate the 184 ms (to be measured in 9.0) | 3 to 5 days | Join/cap shape; hairlines: 1 px ramp must be kept |
| C | Convex and simple POLY interiors as CPU-triangulated, opaque, depth-tested triangles with a vertex-alpha fringe (NanoVG convex path); stencil-then-cover only for concave/holes | Removes 7 draw calls per batch and the multi-pass fringe; one pass per shape | 1 to 2 weeks | Seams between adjacent shapes (see risks); fringe colour bleed on overlaps |
| D | Per-mode programs and a slim vertex (16 to 24 bytes for SOLID/FILL/TEXT/IMAGE; no five-vec4 varying set) | Moves the UI screens, fewer varyings per fragment | 3 to 5 days | None |
| E | 4x MSAA (EGL config already probed in `kms.cpp`) with plain triangles for POLY/STROKE, no fringe, no stencil for the convex case | Simplest shader; cost on vc4 is unknown (tile 32x32 under MSAA doubles the tile count: Mesa doc) | 2 to 3 days to try | Quality is good; memory/tile traffic risk |
| F | Retained geometry: a stable id + affine for POLY/STROKE (the planned `MESH`), vertex buffers kept across frames | Removes per-frame CPU tessellation and uploads for maps | 2 to 3 weeks (touches the command format, the programs, the replay) | None if the transform is exact |
| G | Cached shadow/gradient textures (blur atlas keyed by size+radius+blur, 1D gradient ramps) | UI screens with many shadows | 1 week | Slight difference from the SDF maths |
| H | Damage-limited scissor/partial update for UI screens | UI only | 1 to 2 weeks | None |

Ranking by expected gain over effort: **A first** (safe, immediate), then **9.0 + D + E-experiment** (cheap to try, gives the data),
then **B**, then **C**, then **F**, **G**, **H**. [I]

### 9.2 What replaces what

- **STROKE (option B):** emit for each polyline an indexed triangle strip with per-vertex `(x, y, side, width)`; the fragment shader
  computes `alpha = clamp((halfwidth - |side*halfwidth|) / 1px ...)` exactly as MapLibre's line shader (one clamp, no `length`, no
  `discard`). Joins/caps as extra triangles. Vertex 12 to 16 bytes (position + side + rgba packed). Cache by a hash of the points
  *relative to the first point* plus width/join/cap; on a miss build the strip on the CPU. [I; design pattern sourced from Mapbox GL JS
  line shaders above]
- **POLY, convex (option C):** triangle fan indices (already known from `convex_ok`: <= 8 points), interior opaque in the depth pass
  with the command's `z`, a fringe strip outward by 1 px with alpha 0 at the outer vertices (NanoVG `glnvg__convexFill`: "draw each
  path as GL_TRIANGLE_FAN, then its fringe as GL_TRIANGLE_STRIP"). The fringe needs only a vertex colour alpha. [S] nanovg_gl.h.
- **POLY, concave (option C):** earcut on the CPU, cached by content hash; interior as triangles, fringe strip along the outline built
  from the same contour. Holes handled by earcut. Keep stencil-then-cover only for what earcut refuses (self-intersections) or when the
  vertex count is huge. Mapbox's order (opaque interior in the opaque pass, translucent outline later with depth read only) is the
  model. [S] draw_fill.js above.
- **RECT/BORDER/SHADOW (options D, G):** keep the SDF for rounded corners but in a **separate program with a slim vertex** (`pos`,
  `box`, `radius`, `color`), and only in the corner quads (the `split` logic already exists). Plain rects stay on `SOLID`. Shadows:
  render once into an atlas texture keyed by `(w, h, radius, blur)` quantised to integers, drawn as a nine-patch (so a long shadow is 9
  quads, a small one is 1); gradients with more than two stops go through a 256x1 RGBA ramp texture instead of the `u_gc[8]` loop.
  [I; nine-patch/ramp technique not sourced]
- **Text:** unchanged.

### 9.3 What is cached between frames, keyed how [I]

| Cache | Key | Hit rate |
|---|---|---|
| Triangulation of a POLY | FNV of the points minus the first point, fill rule, vertex count (the existing `fnv`) | High for pans of static shapes, low under rotation/zoom |
| Stroke strip | same + width, join, cap | same |
| Mesh in a vertex buffer | the above hash; LRU, bounded by bytes | same |
| Shadow/gradient textures | `(w,h,r,blur)` / stop-list hash | High on UI |
| With a stable id + affine (option F) | the id; geometry uploaded once | Near 100% for maps |

Without F the cache is only worth its CPU if the miss path (earcut + strip build) is cheaper than what the GPU saves; that is the
measurement in 9.4.

### 9.4 What MSAA would change (option E)

- Shader: POLY/STROKE interiors become flat colour; no fringe quads; no `discard`; the stencil cover pass is still needed for concave
  shapes unless they are triangulated.
- Costs on vc4 (Mesa doc): 32x32 tiles instead of 64x64, so about four times more tile setups for the same screen and more binning
  work; the resolve happens in the tile buffer. Whether a Pi 3B+ at 800x480 with 4x MSAA is net positive vs the fringe must be measured.
  [S/I]
- Requirements: an EGL config with samples (the probe loop in `kms.cpp` lines 164-170 already prints how many exist); or
  `EXT_multisampled_render_to_texture` if the replay renders to an FBO (vc4 support not checked). [not found]
- Quality: 4 coverage levels per edge pixel, less accurate than the analytic ramp for near-horizontal/vertical edges (visible stair
  steps on 1-px lines); NanoVG says fringe and MSAA are alternatives, not additions. [S/I]
- It does not change the CPU golden pixels either way; the GL path is tolerance-compared. [from `gpu-renderer-design.md` section on tests]

### 9.5 How to confirm each option on the Pi

All with the same `navdrive` scenario as `raspberry-pi.md` (260 frames, clock reported with `vcgencmd measure_clock arm` and
`get_throttled` before and after, supply fixed), p50 and p99 of `present`, plus `ZINC_GL_STATS=1` counts.

| Option | Measurement | Success |
|---|---|---|
| A | fps and p99 of the map with auto-select vs `renderer: "gl"` and `"cpu"`; Home/Kit/Forms screens `present` p50 for GL vs bands (not yet measured) | map = bands (43 ms); UI GL <= bands |
| B | ablation: map with strokes as strips vs capsules; draw-call count, `VC4_DEBUG=perf` warnings, frame ms | GPU frame time down by a clear margin; crop-compare at 4x zoom against the software frame (`next/tools/pixel-compare`) |
| C | ablation with POLY only; CPU time for tessellation per frame in `ZINC_PROFILE`; seam check on the Paris map tiles | GPU ms down more than CPU ms up; no visible seams |
| D | UI screens and the glyph-heavy gallery; CPU time to submit and GPU frame ms | lower ms, bytes/frame down (count `nq*4*sizeof(V)`) |
| E | `EGL_SAMPLES=4` build; same run; `v3d_regs`/frame time | lower than B+C without MSAA, or reject |
| F | map with stable ids; CPU time of `paint`+tessellate and upload bytes | upload ~0 after warm-up |
| G, H | UI scenarios with shadows / small damage; GPU ms and tile loads | measurable drop |

### 9.6 Risks to pixel quality [I]

- Fringe-based AA on adjacent polygons that share an edge: each shape's fringe is partly transparent, so the background shows
  through ("conflation"): visible hairlines on land-use maps. Mitigation: draw interiors slightly bleeding (expand opaque interior by
  0.5 px and the fringe by 0.5 px more), or MSAA, or keep the SDF/stencil path for shapes flagged as sharing an edge.
- Vertex AA fringes at very small features (< 1 px wide shapes) collapse; the stencil-then-cover path handles these better.
- Linear ramp vs the CPU rasterizer's 4x4 supersampling: edge coverage differs by a few levels; the GL path is already compared with
  tolerance, not byte-exact (`gpu-renderer-design.md`).
- Depth-tested opaque polygons need unique, ordered `z` per command (Zinc has `depth_of`); the fringe passes must read depth but not
  write it.

## 10. Summary of what the sources do and do not support

Supported: NanoVG/Qt/WebRender-style vertex AA is the standard choice when MSAA is not affordable; Mapbox draws opaque fills in a
depth-tested opaque pass and AA outlines in a separate pass with per-tile retained buffers and per-frame matrices; stencil-then-cover
is chosen by Ganesh and Impeller for concave paths with its overdraw cost acknowledged; Imagination and Arm advise against `discard`;
Mesa vc4 halves tile size under MSAA and says clear/scissor to skip tile loads; Lima shows buffer-age can cost more than a redraw on a
tiler; several GPU-first toolkits keep a CPU renderer for exactly this hardware class.

Not supported by a source (all inference): any statement about how vc4 executes branches/`discard`/mediump; the CPU cost of
tessellating the Paris map on a Pi; the net effect of 4x MSAA on vc4; the seam risk magnitude; effort estimates.
