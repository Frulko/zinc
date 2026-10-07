# Zinc UI and rendering stack: how to build "GPUI plus Skia plus WebGPU" from a 160 KiB MCU to a desktop GPU

Date 2026-10-07. Scope: analysis only, no repository change. All claims about other projects cite files and lines in the clones under `$R = /private/tmp/claude-501/-Users-mowmow-Lab-zinc/e633e5e9-c047-4afa-b08f-85a20488fe60/scratchpad/ui-research/`. Claims about Zinc cite repository paths (`/Users/mowmow/Lab/zinc/...`). Where a statement comes from my general knowledge and not from a file I read, it is tagged **[memory]**. Where something is a proposal and not an existing API, it is tagged **[proposal]**. Nothing in section 4 exists yet. Line numbers are exact where I read them and approximate (within a few lines) where the text says "about".

Clones made (all `--depth 1`, sparse where huge): `zed` (crates/gpui, gpui_wgpu, gpui_macos, gpui_linux, gpui_macros, ui, docs), `gpui-component` (see 2.2: it is the same repository as `gpui-kit`), `react-native-skia`, `react-native-webgpu` (`wcandillon/react-native-webgpu`, the project formerly called react-native-wgpu), `skia` (docs, `src/gpu/ganesh`, `src/gpu/graphite`, `src/text/gpu`, `include/gpu`), `impeller` (flutter/flutter sparse: `engine/src/flutter/impeller/*`), `webrender`, `vello`, `pathfinder`, `imgui`, `lvgl`, `sokol`, `bgfx`, `raylib`, `three` (sparse: `src/renderers`), `gpui-kit-cpp` (a C++ port of gpui-kit found by search, 2.2).

---

## 0. Executive summary

1. **The seam already exists and is the right one.** Zinc records a frame as a flat POD command list (`raster::Cmd`, ten kinds, `runtime/zrt_raster.h:62-73`), diffs it against the previous frame into up to 8 damage rectangles (`runtime/raster.cpp:582`), and hands it to a CPU rasterizer (the oracle) or, since phase 1, to a GLSL ES 1.00 uber-shader backend validated on a Pi 3B+ (`docs/reports/gpu-renderer-design.md`, "Phase 1 validation"). GPUI, Impeller, Skia Graphite, WebRender and ImGui all converge on the same structure: **a backend-neutral, flat, POD frame description consumed by thin per-API backends**. Keep that and make it a first-class, versioned IR.
2. **The single most valuable GPUI idea for Zinc is draw-order ranking, not "GPU quads".** GPUI assigns every primitive an order = 1 + max order of any already-recorded primitive whose bounds intersect it (`zed/crates/gpui/src/scene.rs:87-101`, `bounds_tree.rs:116-135`), keeps one array per primitive kind, sorts by `(order, kind[, texture])` and merges runs (`scene.rs:151-163`, `288-466`). Skia Graphite does the same with `CompressedPaintersOrder` + `BoundsManager` (`skia/src/gpu/graphite/DrawOrder.h:51-60`, `geom/BoundsManager.h:27-47`), and Impeller draws opaque elements in reverse order (`impeller/entity/draw_order_resolver.h:13-45`). Zinc's own phase-1b measurement ("splitting the uber shader ... 90 draw calls, slower", `gpu-renderer-design.md`) is exactly the problem ranks solve: batches break on kind switches in painter order. With ranks, draw calls scale with nesting depth times atlas pages, not with the number of kind switches.
3. **GPUI is not a damage-tracking renderer; Zinc must be.** GPUI replays the whole scene on the GPU every presented frame (`window.rs:3532-3546`, `wgpu_renderer.rs:1123-1215`) and saves CPU work with cached views that copy ranges of the previous frame (`window.rs:3910-4000`, `view.rs:470-570`). Zinc has to run on 40 MHz SPI panels, e-ink and a PS1 where full-frame redraw is impossible, so the plan keeps and extends Zinc's command-diff damage for software and console backends and uses GPUI-style range reuse to cut CPU record cost on every tier.
4. **GPUI's GPU path does not run below GLES3/WebGL2.** It transports per-primitive records in storage buffers or, for WebGL2, in an unsigned-integer texture read with `texelFetch` (`gpui_wgpu/src/wgpu_renderer.rs:23-43, 169-180`; `shaders_webgl.wgsl:138-146`). Neither exists in GLES2/WebGL1 (Raspberry Pi 1 to 3, old phones, old browsers). The T2 backend therefore needs vertex-attribute expansion (4 vertices per primitive, optional `ANGLE_instanced_arrays`), which Zinc's phase-1 GL renderer already does. Port GPUI's **primitive semantics and SDF math** (`shaders.wgsl:362-389, 564-900, 999-1046`), not its shader transport.
5. **Tiers are feature floors, backends are implementations.** One Scene IR; five capability tiers (T0 MCU, T1 fixed-function console, T2 GLES2/WebGL1, T3 GLES3/WebGL2, T4 modern desktop); backends: SW band/tile rasterizer (any tier, the oracle), console GPU-primitive backends (PS1 GP0 packets, PS2 GS sprites), GL (one code base with ES2 and ES3 paths, also driven from JS on the web), native modern (sokol_gfx or Dawn, decided by a spike). Anything the hardware cannot do degrades by a documented rule (4.13), never by crashing.
6. **Three.js is a WebGL2 library today.** The cloned `three` (package.json 0.186.0) creates only a `webgl2` context (`src/renderers/WebGLRenderer.js:60, 411`), and its new `WebGPURenderer` falls back to a WebGL2 backend (`src/renderers/webgpu/WebGPURenderer.js:24, 41, 57, 67`). "Full three.js compatibility" therefore means: (a) a real `zinc:webgl` context (WebGL2 on T3/T4, WebGL1 on T2 with an older three that still supports it, **[memory: WebGL1 removed in r163]**) exposed to scripts through the already-shipped QuickJS-ng module (`zinc:script`, ZN-103); (b) on the web target, pass-through to the browser. Today's `plugins/three` is a 1558-line TypeScript re-implementation on a software z-buffer (`plugins/three/index.ts`, class named `WebGLRenderer` at line 1382); it is not three.js and should stay as the T0/T1 fallback.
7. **Zinc's typed AOT compiler is the unfair advantage.** No GC (explicit RC), closed-world class layouts, compile-time hoisted styles (`docs/ui.md` "Object styles and StyleSheet"), so SoA node storage, an arena per frame and a "no allocation in paint" compiler check are plausible in a way they are not for React Native Skia or Flutter. Today `lib/std/ui.ts` still allocates in `measure()` (`ui.ts:845-870`: `const kids: UiNode[] = []`, `abs`), and the docs admit "Dynamic inline records/arrays still allocate".
8. **A contradiction to resolve first.** Decision D11 (`docs/reports/zinc-next-decisions.md:80`) and ZN-116 say "GL 3.3/GLES3 via GLAD"; the implemented and Pi-validated renderer is GLSL ES 1.00 (GLES2) and the Pi 1/2/3 only have GLES2. The floor must be GLES2 for T2 with an ES3 path added for T3 (roadmap R1.3).

---

## 1. What Zinc has today (facts from the repository)

| Area | State | Source |
|---|---|---|
| Command list | `raster::Cmd` 48 bytes (`kind, alpha, grad, pad, res, x,y,w,h, r,s, c1,c2, off,n`), kinds `CLEAR RECT BORDER SHADOW LINE TEXT IMAGE POLY CLIP UNCLIP`; frame = `{cmds, count, text pool, point pool}` | `runtime/zrt_raster.h:62-85` |
| Recording | `gfx.cpp` keeps two `Buf`s of `ZRT_MAX_DRAW_CMDS` (default 8192 = 393 KB per buffer), 32 KiB text pool, 32768-float point pool; commands past the limit are dropped. PS1 overrides to 512 cmds, 4 KiB text, 2 K points (72 KiB for the two lists) | `runtime/gfx.cpp:6-14, 57-70`; `targets/ps1/ps1.cmake:11`; `docs/targets/playstation.md` "Memory budgets" |
| Damage | `diff_rects` between consecutive frames into up to `ZRT_DAMAGE_RECTS` rectangles; idle frames call `gfx.keep()` and skip raster and swap | `runtime/gfx.cpp:645-690`; `raster.cpp:568-620` |
| CPU rasterizer | float code (`float x,y,w,h`), SDF rounded rect (`rr_sdf`, `raster.cpp:43`); per-band `render()` walks the whole command list per band (`raster.cpp:484-543`); 16-row bands pulled from an atomic counter by `render_bands.h`; bit-identical for 1..4 threads over 200 frames; x2.4 fps on a Pi 3B+ | `runtime/include/render_bands.h:1-30`; `docs/reports/render-perf-options.md` "Result of option A" |
| GL backend | `plugins/display-gl`: SDL3 + GL 3.2 core (macOS), KMS/GBM/EGL/GLES2 (Pi). `gl_renderer.cpp` (480 lines) replays the lists into an RGBA texture with one GLSL ES 1.00 uber shader; supports `CLEAR RECT BORDER SHADOW CLIP UNCLIP TEXT IMAGE`; `LINE`/`POLY` counted and skipped; 1024x1024 glyph atlas (`GL_LUMINANCE`); validated on vc4 (Mesa 25.0.7) | `docs/reports/gpu-renderer-design.md` "Phase 1 implementation notes" and "Phase 1 validation"; `plugins/display-gl/src/gl_renderer.cpp` |
| GL measurements | 4-6x less CPU per frame (7.2 to 1.1 ms), but a whole-surface animation was GPU-bound at 15.5 ms (replay 12.7 + present pass 2.8) = 38.7 fps; fixed by waiting for the previous page flip at the next swap (Home 28.5 to 53.5 fps). A previous build hung the VC4 on partially changing screens ("Resetting GPU" loop, power cycle); cause unconfirmed | same, "Phase 1b" |
| Targets | macOS/Linux SDL3 HAL; wasm HAL = canvas 2D present (`targets/wasm/hal_web.cpp`); PS1 HAL = soft-float software raster then `LoadImage` to VRAM (`targets/ps1/hal_ps1.cpp`); PS2 HAL = software raster into a CT32 texture then one gsKit sprite (`hal_ps2.cpp`); ESP32 ST7789 plugin = band raster of 6 to 16 rows, RGB565 in place, 15 KiB of internal RAM left to the heap | files named; `plugins/display-st7789/st7789.cpp:1-67`; `docs/targets/playstation.md` |
| Profiles | esp32 f32, 160 KiB heap, strict typing; ps1 fx12 (Q20.12), 256 KiB heap, no FPU; ps2 f32, 16 MiB; wasm 64 MiB; rpi1 64 MiB; fx lowering not implemented yet (ZN-120/121) | `compiler/src/cli.ts:34-44`; `next/backlog/tasks/zn-120*, zn-121*` |
| UI layer | `lib/std/ui.ts` (2843 lines): retained node tree written in Zinc, hand-written flexbox `measure()` recursion with full relayout when `layoutDirty` (`ui.ts:816-870, 948-957`), `paintDirty` global flag, `frame()` calls `keep()` when nothing changed (`ui.ts:2193`), Tailwind-like classes and `StyleSheet.create` (compile-time hoisted), scroll physics, layers/anchoring, keymaps "(GPUI)" | `docs/ui.md`; `lib/std/ui.ts` |
| Drawing plugins | `canvas2d`, `svg`, `lottie` emit `POLY`/`LINE` through `gfx::emit` with point pools up to 262144 floats; `3d` is a software z-buffer rasterizer (16.16 edges, 16/32-bit Z, 16-bit on ESP32) whose output is a runtime image drawn as one `IMAGE` command (`plugins/3d/native/render3d.host.cpp:1-12`); `three` = API subset in TS on `zinc:3d` | `plugins/*/plugin.json` |
| Backlog | M9 plugins (ZN-102..112, 117), M11 rendering (ZN-114 text, 115 codecs, 116 GL path, 118 SDL3, 119 glTF), M12 profiles/targets (ZN-120..137, 156, 157), M10 demos (ZN-113 goldens, 151..155), M14 perf (ZN-144..150) | `next/backlog/tasks`, `next/backlog/milestones` |
| `capabilities.json` | has a `gpu` key, but it is `false` for every target including the GL-capable ones | `targets/capabilities.json` |

Two facts that shape everything below:

* **Floats on a soft-float console.** The PS1 build runs the float rasterizer on a CPU with no FPU and redraws "the bounding box of everything that changed, which here spans most of the screen" (breakout at about 20 fps in PCSX-Redux). The target doc itself says "a fixed-point path or GPU primitives for plain rectangles and text would be the fix" (`docs/targets/playstation.md`, "Verification status").
* **The web path presents a software frame.** `hal_web.cpp` is canvas 2D. There is no WebGL path, so WebGL1/2 support and the three.js requirement are greenfield.

---

## 2. What the reference projects actually do (read from source)

Notation: `file:lines` are in the clone. "Take" and "reject" are for Zinc.

### 2.1 GPUI (zed-industries/zed, `crates/gpui`, `crates/gpui_wgpu`, `crates/gpui_macos`)

**Element model, three phases.** `Element` has `request_layout`, `prepaint`, `paint` (`gpui/src/element.rs:36-95`). The element tree is rebuilt every frame from `Render::render()` and "the entire element tree and any callbacks they have registered with GPUI are dropped" before the next frame (`element.rs:1-30`), allocated in a per-App arena (`arena.rs`, `window.rs:3353-3366` `ElementArenaScope`). Persistent per-element state lives in `element_states` keyed by `(GlobalElementId, TypeId)` and is moved from the previous frame at `Frame::finish` (`window.rs:1035-1052, ~1198-1206`). Layout is **Taffy** (`taffy.rs:31-60`), with rounding disabled (`taffy.disable_rounding()`, `taffy.rs:45`) and snapping done at paint (`snap_bounds`, `window.rs:3219-3229`; `paint_quad`, `window.rs:4598-4616`). Measured leaves are closures (`request_measured_layout`, `taffy.rs:85-104`). The three phases exist so that prepaint can register hitboxes, tooltips, key contexts and text layouts for the frame before paint inserts primitives; hover state is computed from the *next* frame's hit test before paint (`draw_roots`, `window.rs:3597-3680`: `self.mouse_hit_test = self.next_frame.hit_test(...)` precedes `root_element.paint`).

**Invalidation.** `Entity<T>` handles live in the `App` (`_ownership_and_data_flow.rs:1-40`); `cx.notify()` marks an entity and its observers (`app/context.rs:221-224`). A window keeps `dirty_views`, and `mark_view_dirty` marks ancestors (`window.rs:2240-2252`). `AnyView::cached(style)` returns a `ViewElement` (`view.rs:44, 242-282`): in prepaint, if the cache key (bounds, content mask, text style) is unchanged, the view is not dirty and the window is not "refreshing", GPUI does `window.reuse_prepaint(range)` and later `window.reuse_paint(range)` (`view.rs:470-495, 568`), which copy hitboxes, tooltip requests, dispatch-tree subtrees, line layouts, and *replay the primitives of the previous scene by range* (`scene.rs:141-149`, `window.rs:3910-4000`). So **cached views save CPU recording, not GPU work.**

**Frame scheduling.** The platform delivers `on_request_frame` (`window.rs:1757`). If the window is dirty or forced it runs `draw` then `present` (`window.rs:1877-1899`); otherwise, if `needs_present`, it only re-presents the last scene. Throttles: about 60 fps cap under serious/critical thermal state, a lower cap for inactive windows, and a one-second "keep presenting after high-rate input" window (`window.rs:1813-1830, 1877-1881`). `request_animation_frame` is `on_next_frame(|| cx.notify(view))` (`window.rs:2698-2724`). macOS uses a single immortal `CVDisplayLink` per display (`gpui_macos/src/display_link.rs:1-60`). The Metal renderer is "the extracted renderer" in another crate that is **not** in this checkout (`gpui_macos/Cargo.toml:67`), so I could not read it; everything about shaders below comes from the WGSL ones.

**Scene and primitives** (`scene.rs`):

| Primitive | Fields that matter | Lines |
|---|---|---|
| `Quad` | `order, border_style(Solid/Dashed), bounds, content_mask, background (solid or 2-stop gradient, linear, oklab option), border_color, corner_radii(4), border_widths(4)` | 535-544 |
| `Shadow` | `order, blur_radius, bounds, corner_radii, content_mask, color, element_bounds, element_corner_radii, inset` | 574-586 |
| `Underline` | `thickness, wavy` | 555-563 |
| `MonochromeSprite` | `bounds, content_mask, color, tile(AtlasTile), transformation(2x3 affine)` (glyphs, SVG masks) | 711-719 |
| `SubpixelSprite` | same, three-channel coverage for LCD text (dual-source blending) | 730-738 |
| `PolychromeSprite` | `grayscale, opacity, bounds, content_mask, corner_radii, tile` (images, emoji) | 749-758 |
| `Path` | CPU-tessellated vertices with `(s,t)` Loop-Blinn coordinates, bounds, colour | 789-799; lyon in `path_builder.rs:3-6` |
| `Surface` | external video buffer; macOS only: "not implemented by the WGPU renderer" | `window.rs:5069`, `wgpu_renderer.rs:1610-1614` |

Every struct is `#[repr(C)]` with explicit padding ("`PaddedBool32` ... so that GPU-facing structs contain no compiler-inserted padding bytes", `scene.rs:25-37`) so the arrays are uploaded as raw bytes.

**Ordering and batching.** `insert_primitive` computes `clipped_bounds = bounds ∩ content_mask`, drops empty ones (`scene.rs:89-95`), then `order = layer_stack.last() or primitive_bounds.insert(clipped_bounds)` (`scene.rs:97-101`). `BoundsTree::insert` returns `max order of intersecting bounds + 1` using an R-tree with branching factor 12 and a "max leaf" fast path (`bounds_tree.rs:11-35, 116-195`). `push_layer` reserves one order for a whole group (`scene.rs:75-80`). `finish()` sorts each kind's array by `(order, tile_id)` (`scene.rs:151-163`). `batches()` repeatedly picks the kind with the smallest `(next order, kind)` and consumes its run while `(order, kind) < (second-smallest order, kind)` and, for sprites, `texture_id` is unchanged (`scene.rs:288-466`, texture check at 392-401). The wgpu backend draws each batch with `pass.draw(0..4, first_instance + start .. first_instance + end)`, a 4-vertex triangle strip instanced over the records (`wgpu_renderer.rs:1735-1752`); paths are the exception, rasterized into an intermediate texture (optionally MSAA, `path_sample_count`) in a separate pass and composited (`wgpu_renderer.rs:1538-1573, 193-209, 946-1000`).

Key invariants: two primitives with the *same* order never overlap (otherwise the second would have gotten +1), so inside an order they may be reordered freely, which is why kinds can be grouped. Order is a function of bounds only, so one tree serves all kinds.

**Quad SDF in the fragment shader** (`gpui_wgpu/src/shaders.wgsl`): the vertex stage emits a unit quad from `vertex_id & 1, 0.5 * (vertex_id & 2)` (line 543) and clip distances against the content mask (`distance_from_clip_rect`, 192-208; the fragment discards when any is negative, 566-569, "since we don't have `clip_distance`"). `quad_sdf` picks the corner radius of the quadrant (`pick_corner_radius`, 341-359) and returns `length(max(0, p)) + min(0, max(p.x, p.y)) - r` (`quad_sdf_impl`, 372-389). `fs_quad` has a fast path "when the quad is not rounded and doesn't have any border" returning the background directly, and otherwise computes outer/inner SDF with `antialias_threshold = 0.5` (564-640). Shadows: analytic Gaussian-blurred rounded box, integrating along x with an `erf` polynomial and summing four y samples (`erf` 325-331, `blur_along_x` 333-339, `fs_shadow` 999-1046, comment "we can get away with surprisingly few samples"); inset shadows are `1 - alpha` clipped by the element SDF. `paint_quad` also **splits border-only quads into four strips** so the transparent interior is not shaded (`window.rs:4614-4660`). Paths: `fs_path_rasterization` uses `dpdx/dpdy` of `(s,t)` for analytic AA (`shaders.wgsl:1079-1100`), so it needs derivatives (not available on vc4, see 4.11). Gradients can interpolate in oklab (`linear_srgb_to_oklab`, 278-311). Dual-source blending is gated by a device feature and disabled on the WebGL transport (`wgpu_renderer.rs:41-43, 686-699`).

**Text.** Shaping and rasterization are platform text systems (CoreText on macOS; `cosmic-text` + `swash` on Linux/Windows/web: `gpui_wgpu/src/cosmic_text_system.rs:3-22, 52`). The glyph key is `RenderGlyphParams { font_id, glyph_id, font_size, subpixel_variant, scale_factor, is_emoji, subpixel_rendering, dilation }` (`text_system.rs:1264-1275`); the origin is quantized to 4 horizontal and 1 vertical subpixel variants (`SUBPIXEL_VARIANTS_X = 4`, `text_system.rs:49-52`, `paint_glyph`, `window.rs:4735-4800`). Line layouts are cached across frames in a two-generation cache (`line_layout.rs:458-480`) keyed by content hash, with an allocation-free lookup by hash ("allow cache hits without materializing a contiguous `SharedString`"). Atlas: `PlatformAtlas::get_or_insert_with(key, build)` (`platform.rs:1690-1703`), three texture kinds `Monochrome/Polychrome/Subpixel` (`platform.rs:1906-1910`); the wgpu atlas uses `etagere::BucketedAtlasAllocator`, 1024x1024 default, R8 for monochrome, queued uploads (`wgpu_atlas.rs:2, 29-40, 162-232`).

**Hit testing and input.** `insert_hitbox(bounds, behavior)` in prepaint; `Frame::hit_test` scans hitboxes in reverse insertion order, intersects with the content mask, and stops at `BlockMouse` (`window.rs:1163-1185`; `HitboxBehavior::{Normal, BlockMouse, BlockMouseExceptScroll}`, 888-920). Keyboard goes through a `DispatchTree` of key contexts and focus ids (`key_dispatch.rs:71-80`), the model Zinc's `ui.bindKeys` already copies (`docs/ui.md` "Focus scopes and keymaps").

**What makes it fast, honestly.** (1) Few draw calls from ranks. (2) Per-kind SDF shaders that do the minimum (fast path for flat quads). (3) One upload of POD arrays per frame, no per-primitive vertex building on the CPU. (4) Glyph/sprite atlases with subpixel variants cached forever. (5) Arena allocation of the element tree and a content-hashed text layout cache. (6) Cached views skipping layout/prepaint/paint. (7) Retained scene replay by range. (8) It repaints the *whole window* on the GPU, acceptable only because the GPU is fast and the content is rectangles and glyphs. I found no benchmark numbers in the checkout (there is a `gpui_wgpu/benches` directory I did not read).

**Take:** primitive set and POD layout, order ranks with a bounds tree, per-kind arrays, SDF math, border split, glyph key with subpixel variants, two-generation text cache, range replay, hitbox behaviors, frame throttling by thermal/input/inactive.
**Reject:** the element-tree-per-frame rebuild as the *only* model (Zinc's `ui.ts` is already retained), Taffy (Rust, see 2.2/4.8), storage-buffer or integer-texture instance transport below T3, derivative-based path AA below T3, oklab gradients by default (changes pixels vs the prototype goldens).

### 2.2 gpui-component / gpui-kit (longbridge)

`github.com/longbridge/gpui-kit` exists and is **the same repository** as gpui-component at the same HEAD (`29c0457`, "webview: Compose native views with the GPUI Fast backend"); the README is titled "GPUI Kit" and says "gpui-kit pins the matching GPUI release and re-exports GPUI, base, component, and assets" (`gpui-component/README.md:1-40`). I cloned it once (`gpui-component/`). Layers (README "Three layers"): `gpui-base` (unstyled behavior: focus, a11y via AccessKit, animation, virtual list, theme tokens), `gpui-component` (styled, 75+ components), `gpui-shell` (JavaScript extension host on QuickJS, `crates/shell/README.md`; `Cargo.toml:43` pins a `quickjs-jit` fork; "A script never renders. It describes an interface once, and Rust replays that description into real GPUI elements", the same split Zinc already has between app code and host).

What a kit adds on top of a renderer (all UI-layer code, no renderer change):

* **Unstyled base + semantic tokens**: `Button::new` has no padding/colour by contract (`base/README.md`); `SemanticThemeTokens { colors, radius, spacing, typography, shadow }` deliberately has no component-specific fields (`crates/base/src/theme_tokens.rs:1-50`). Zinc's `lib/std/kit/theme.ts` is 78 lines and component-oriented; a token layer is the cheap way to get themes without recompiling styles.
* **Virtual lists**: `VirtualList` renders only the visible range for variable-size items, "Inspired by `gpui::uniform_list`" (`crates/base/src/virtual_list.rs:1-12`, 905 lines). Zinc has `n.virt` with fixed `itemH` (`ui.ts:323, ~870`); variable heights are the gap.
* **Motion**: `crates/base/src/motion/{easing,keyframes,presence,reveal,sequence,stagger,timing}.rs` (`motion.rs` is 1831 lines) plus `reduce_motion.rs`, mirroring GPUI's `App::reduce_motion` (`window.rs:~2706-2715`).
* **Heavy widgets**: table with fixed/resizable columns and virtual rows, dock layout (serializable), Tree-sitter editor, charts (`base/src/plot/`), markdown/HTML renderers, `text_selection`, `touch_selection`.
* **UI integration testing**: render real components in headless windows, drive pointer/keyboard, assert layout/focus/a11y (README "UI Integration Testing"; `crates/kit/TESTING.md`). Zinc's equivalent is `ui.pointerAt/keyDown` plus golden PNGs (`docs/ui.md` "Tests").

`kjk/gpui-kit-cpp` (cloned) is "a C++ port of longbridge/gpui-kit" with **no licence** (GitHub reports `licenseInfo: null`), so it can only be read, not vendored. Its note `info-scene-graph.md:1-30` records the decision *not* to port GPUI's scene graph ("porting Zed's scene graph as a whole is not currently worth the cost") because it draws through Direct2D/Cairo/CoreGraphics and only needs culling, geometry caching and whole-frame comparison. Useful data point for Zinc T0..T2: a retained recorder with frame comparison and culling is the 80% solution; ranks matter when you issue GPU draw calls.

**Take:** token layer, variable-height virtual list, motion/presence primitives, `reduce_motion`, headless UI test harness, dock/table as later kit components. **Reject:** a second JS "shell" (Zinc already has `zinc:script`), Tree-sitter editor as a dependency for now.

### 2.3 Skia: Ganesh and Graphite

* **Ganesh** (`skia/src/gpu/ganesh`): draws are "ops"; `GrOp::combineIfPossible` merges ops of the same subclass (`ops/GrOp.h:46, 108-129`); `OpsTask` tries to merge/chain a new op with up to `kMaxOpChainDistance = 10` earlier chains, allowed only when the bounds do not overlap (`ops/OpsTask.cpp:55-59, 233-275, 1097-1142`). Atlases: `GrDrawOpAtlas` with up to 4 pages and 32 plots, eviction by plot usage tokens (`GrDrawOpAtlas.h:142-143`). Path renderers are chosen per path (AAConvex, AALinearizing, Tessellate, StencilCover, Atlas, DashLine ... in `ops/`). The GL backend carries capability checks across GL/GLES versions (`gl/GrGLCaps.cpp`).
* **Graphite** (`skia/src/gpu/graphite`): a `Recorder` makes `DrawList`s sorted into `DrawPass`es. `DrawOrder` = three sequences: `PaintersDepth` (original order, also used as the depth value with a GREATER test), `CompressedPaintersOrder` (draws with the same value may execute in any order), `DisjointStencilIndex` for stencil-then-cover steps (`DrawOrder.h:51-105`). `BoundsManager` tracks "the most recent draw intersecting a bounding rect" with several implementations (naive, hybrid) (`geom/BoundsManager.h:27-60, 247`). The sort key packs `(paintOrder, stencilIndex, renderStep, pipelineIndex)` then uniform/texture indices (`DrawList.h:152-175`). A `Renderer` is a list of `RenderStep`s (`render/` has AnalyticRRect, AnalyticBlur, BitmapText, SDFText/SDFTextLCD, CoverBounds, Tessellate{Curves,Strokes,Wedges}, MiddleOutFan, PerEdgeAAQuad, Vertices, CoverageMask, WideTile...). Backends: Metal, Vulkan, Dawn only (no GL; `ls src/gpu/graphite`). `sparse_strips/` (8x8 tiles, an alpha atlas, `SparseStripsConfig.h:19-40`) and `render/WideTileRenderStep.*` show Skia adopting the Vello sparse-strip design.

**Take:** the (paint order, depth) model as the formal justification of ranks; "analytic RRect / analytic blur" steps as SDF primitives; plot-based atlas eviction; a `Caps` struct. **Reject:** the whole library (tens of MB; `gpu-renderer-design.md` section 12 already says so), runtime SkSL compilation, the path-renderer zoo.

### 2.4 react-native-skia

Pipeline: React renders a **scene graph** through a custom `react-reconciler` host (`src/sksg/Reconciler.ts:1-50`, `HostConfig.ts`), the JS `Recorder` serialises it into a flat `Command[]` of `CommandType` values (`SavePaint, SaveCTM, DrawRect, DrawRRect, DrawPath, DrawImage, DrawVertices, DrawAtlas, SaveLayer, PushShader/ColorFilter/ImageFilter...`, `src/sksg/Recorder/Core.ts:28-60`; `Recorder.ts:49-80`), and the native view **owns the recording and replays it on every draw** (`Container.native.ts:13-30`). C++ side: `cpp/api/recorder/RNRecorder.h` (commands as objects; `play(ctx)` at line 445).

**Reanimated integration without re-running JS or React:** the recording has *variables*; the Reanimated mapper only pushes shared values into the native recorder by id (`SkiaViewApi.applyUpdates(nativeId, recorderId, sharedValues)`, `Container.native.ts:70-76`). Native keeps "pending writes, one slot per conversion function: a value read several times between two replays is written once (the last read wins)" under a mutex (`RNRecorder.h:42-70`, `applyUpdates` at 497). That is exactly the "property slots" mechanism proposed in 4.8.

JSI bridge: `SkiaApi` and `SkiaViewApi` are installed as JSI host objects (`cpp/rnskia/RNSkManager.cpp:50-62`), 60+ `Jsi*` files wrap Skia classes (`cpp/api/`). GPU: Graphite on Dawn; "react-native-webgpu is the single WebGPU API surface"; Skia and WebGPU "share the same GPU device and can exchange textures without any copy. This also works with three.js" (`README.md:37-41`, `RNSkManager.cpp:57-62`).

**Take:** record-then-replay with *numeric variables patched in place*; declarative `<Canvas>` of draw primitives as a second JSX surface next to layout nodes; shared device so a 3D view and the 2D scene exchange textures without a copy. **Reject:** Skia itself; the JS-thread/UI-thread worklet machinery (Zinc has one typed runtime).

### 2.5 react-native-webgpu (wcandillon, formerly "react-native-wgpu")

A JSI binding of **Dawn** exposing the W3C WebGPU API: 70 files in `packages/webgpu/cpp/rnwgpu/api` (`GPUDevice`, `GPUQueue`, `GPUCommandEncoder`, `GPURenderPassEncoder`, `GPUBuffer`, `GPUTexture`, `GPUShaderModule`, ...), `cpp/jsi/JSIConverter.h` for type conversion, `async/RuntimeContext` for promise resolution and device-lost events (`RNWebGPUManager.cpp:50-80`). Dawn is pinned to the exact commit in Skia's DEPS for the Skia milestone (`CONTRIBUTING.md:26-37`) so both libraries can share one device. It is exposed as `navigator.gpu`, which is how three.js and TypeGPU run on RN (`software-mansion-labs/react-native-webgpu-worklets`, found by search, not cloned).

**Take:** the architecture for `zinc:webgl` / `zinc:webgpu`: typed native object model bound to scripts through one converter layer, a pinned GPU library version, promise/async plumbing for device-lost events. **Reject:** Dawn as a default dependency for Zinc (size, C++ build, no GLES2 path); revisit for T4 only.

### 2.6 Impeller (Flutter)

README "Objectives": predictable performance (all shader compilation and reflection offline, all pipeline state objects built up front, "caching is explicit and under the control of the engine"), instrumentable (all resources labelled), portable, effective concurrency (`impeller/README.md:14-29`). Structure: `compiler` (impellerc) compiles GLSL 4.60 to SPIR-V then to the backend language and generates C++ reflection (no runtime reflection); `renderer` (backend-agnostic, with `renderer/backend/{gles, metal, vulkan}`); `entity` (2D framework: `Contents` = what to draw, `Geometry` = shape, `EntityPass` = layers/clips, `DrawOrderResolver`); `display_list` (Flutter's recorded op list as input); `typographer` (renders shaped glyph runs from atlases; no shaping inside Impeller) (`README.md:45-125`).

* `DrawOrderResolver` records draws in painter order and sorts: opaque elements are order-independent and drawn **in reverse painter's order so they cull one another** (depth test), dependent (translucent) ones after, per clip-stack "draw order layer" (`entity/draw_order_resolver.h:13-45`).
* `UberSDFContents` draws circles, rects, ovals, rounded rects and rounded superellipses with a **single SDF shader** and 1 px AA (`entity/contents/uber_sdf_contents.h`, `uber_sdf_parameters.h`: `kAntialiasPixels = 1.0`), with linear/radial gradients from a ramp texture or an SSBO. Same idea as Zinc's current uber shader, from the team that also has per-shape blur contents (`solid_rrect_blur_contents`).
* **GLES backend with a GLES2 floor**: "Since we target GLES2" (`renderer/backend/gles/blit_command_gles.cc:78-82, 418-422`); instancing via `glVertexAttribDivisor` when present, else `EXT_instanced_arrays`, else per-vertex only; no VAO on ES so stale divisors are cleared per pipeline (`buffer_bindings_gles.cc:244-262`); capability flags for framebuffer fetch, 32-bit indices (`OES_element_index_uint`), implicit MSAA (`EXT_multisampled_render_to_texture`), ES3-only MSAA (`GL_MAX_SAMPLES>=4`), texture arrays by *proc availability* not version, ETC2 only on ES3, and a **driver-quirk workaround**: Mali "texture upload rebind" keyed on the renderer string and driver release (`capabilities_gles.cc:67-80, 170-262`).

**Take:** offline shader pipeline (one GLSL source, per-backend variants), explicit pipeline cache, labelled resources, caps-by-proc-availability plus a renderer-string quirks table, reverse-order opaque culling as an optional T2/T3 pass, one SDF contents path. **Reject:** Flutter's `display_list` coupling; the full `entity` filter graph.

### 2.7 WebRender (servo/webrender, Firefox)

* **Batching** (`webrender/src/batch.rs`): `BatchKey { kind, blend_mode, textures }` (233-245); opaque and alpha lists (`AlphaBatchContainer`, 549; `set_params_and_get_batch` routes by blend mode, 696-725); each `PrimitiveBatch` is a key plus `instances` and `BatchFeatures` flags so a batch can use a specialised shader unless a feature is requested ("Rather than breaking batches when primitives request different features, we always request the minimum amount of features to satisfy all items in the batch", 515-530); a lookback of `lookback_count` previous batches with an area threshold decides whether a primitive joins an earlier batch (`batch.rs:415-465, 638-649`). Several textures per batch (`BatchTextures`, 132-231).
* **Picture caching** (`picture.rs`): content is split into **tiles** of 1024x512 device pixels (`TILE_SIZE_DEFAULT`, 266-271); each tile hashes the primitives that touch it and is invalidated with a reason enum (`InvalidationReason::{Content, PrimCount, ScaleChanged, NoTexture ...}`, 749-771); `Tile.local_dirty_rect` / `device_dirty_rect` (773-790); dirty rects are only used if the compositor supports it (`supports_dirty_rects`, 1264-1293). `TileCacheInstance` (1761) owns the tiles of one scroll root.
* **GPU cache** (`gpu_cache.rs:5-50`): per-primitive data lives in a float texture; callers `request(handle, closure)`; entries unused for N frames are evicted (line 49); width capped by `MAX_VERTEX_TEXTURE_WIDTH` = 1024 (188, 395). That is a *vertex-texture-fetch* transport, also not safe on GLES2 vc4-class hardware.
* **swgl** (`webrender/swgl`): a software OpenGL that runs WebRender's own GLSL on the CPU, "will shade one quad at a time using a 4xf32 vector with one vertex per lane ... shades that span 4 pixels at a time" (`swgl/README.md:1-12`) plus `glsl-to-cxx`. It proves one shader source can serve GPU and CPU; it also shows the cost (a GLSL-to-C++ compiler).
* Licence: MPL-2.0 file headers (e.g. `gpu_cache.rs:1-3`), so copying files is not an option; read and re-derive.

**Take:** content-hash tile invalidation for scrolling/static layers on T2 (fill-rate bound), batch `features` flags (shader specialisation without breaking batches), per-frame eviction of retained GPU data. **Reject:** vertex-texture transport, swgl-style GLSL-on-CPU for 10 primitives (our CPU rasterizer is smaller and exact).

### 2.8 Vello

`vello/ARCHITECTURE.md:17-37`: two families. **Sparse Strips** (`vello_cpu`, `vello_gpu`): paths are flattened, binned into **4x4 tiles** (`vello_common/src/tile.rs:263-266`) and kept as horizontal strips with coverage only along boundaries; CPU SIMD + multithread, or "performs the same broad preprocessing on the CPU, then uploads scheduled strips and paint data for GPU rasterization ... **wgpu and WebGL2 backends use vertex and fragment rendering rather than requiring compute shaders**". The scheduler allocates intermediate texture pages bottom-up for layers, minimising allocations over passes (`vello_gpu/src/schedule/mod.rs:4-33`). A WebGL **probe** renders test patterns to verify features at runtime (`vello_gpu/src/render/webgl/probe.rs`). The compute-shader renderer lives in `research/` and needs compute-capable GPUs. Skia Graphite reimplements the same idea (2.3). Pathfinder 3 (`pathfinder/README.md`) is "OpenGL 3.0+, OpenGL ES 3.0+, or Metal", incomplete: reject.

**Take:** for complex vector content on T3/T4 and for a better CPU path renderer later: sparse strips (tile coverage along edges only); the "probe" idea; layer scheduling by texture pages. **Reject:** the Rust crates themselves (no Rust in the engine build), the compute renderer.

### 2.9 Dear ImGui

`ImDrawCmd { ClipRect, TexRef, VtxOffset, IdxOffset, ElemCount, UserCallback }` (`imgui.h:3233-3250`), vertex 20 bytes (pos, uv, col; 3254), **16-bit indices by default** with a backend flag to support `VtxOffset` for meshes over 64K vertices (`imgui.h:3205-3211, 1772`); commands are merged while `ClipRect/TexRef/VtxOffset` are unchanged because those fields "must be contiguous as we memcmp() them together" (3238-3240; `imgui_draw.cpp:591-640` `_OnChangedClipRect/_OnChangedTexture`). Geometry is **CPU-tessellated with an anti-aliasing fringe** of width `_FringeScale = 1/pixel_density` (`imgui_draw.cpp:726, 831-842, 1087-1110`); rounded rects are `PathRect` + convex fill (1457, 1535); an `ImDrawListSplitter` supports out-of-order channels merged back (`imgui.h:3285`, `imgui_draw.cpp:2190`); `AddCallback` lets the app change GPU state or draw a 3D scene inside a UI element (`imgui.h:3213-3225`); the font/texture atlas became dynamic with `ImGuiBackendFlags_RendererHasTextures` (1773). Backends are small (`backends/`: GL2, GL3, Metal, DX9-12, Vulkan, SDL GPU, Allegro, ...) because the contract is "triangles + scissor + texture".

**Take:** the *minimal backend contract* (indexed triangles, scissor, texture id, user callback) as the universal fallback format that any GPU or software-triangle backend can run; the CPU AA-fringe technique for paths on hardware without derivatives; callbacks with explicit state reset for embedding 3D. **Reject:** CPU tessellation of rounded rects on T3+ (SDF is cheaper and exact), the immediate-mode API (Zinc is retained).

### 2.10 LVGL (embedded)

Display refresh model (`src/core/lv_refr.c`): invalid areas collected with `lv_inv_area` (269), at most `LV_INV_BUF_SIZE = 32` (`display/lv_display_private.h:30`) with overflow falling back to the whole screen (335-337), **joined when the union is smaller than the sum of the areas** (`lv_refr_join_area`, 634-665); in `PARTIAL` render mode each invalid area is cut into row strips that fit the draw buffer, drawn with the widget tree walked per strip, and flushed (`refr_invalid_areas`, 792-880). The draw buffer can be 1/10 of the screen, `LV_MEM_SIZE` defaults to 64 KiB for all objects (`lv_conf_template.h:59`), refresh period 33 ms (153). Drawing: widgets create **draw tasks** (fill, border, box shadow, label, image, arc, line, triangle, layer, vector, 3D) queued per layer (`draw/lv_draw_private.h:30-70`); **draw units** each have `evaluate_cb` (claim a task with a preference score) and `dispatch_cb` (take the next independent task), so a DMA2D, PPA, NemaGFX, VG-Lite, EVE, OpenGL ES or NanoVG unit can take over from the software unit per task type (`lv_draw.c:154-195, 219-310`, `lv_draw_private.h:110-118`; directories `draw/{sw,vg_lite,opengles,eve,nanovg,nema_gfx,dma2d,espressif,renesas,nxp,sifli,sdl}`). The software unit supports RGB565, RGB565A8, RGB888, XRGB8888, ARGB8888, L8, A8, **I1**, with optional multiple draw units (`lv_conf_template.h:227-271`).

**Take:** the area-joining rule, bounded dirty list with whole-screen fallback, strip rendering sized to RAM, the task `evaluate/dispatch` hook for hardware 2D accelerators, RGB565/A8/I1 as first-class formats, fonts in flash. **Reject:** immediate widget-tree repaint per strip as the *only* scheme (fine for T0 only); LVGL's object model and styling (Zinc must keep its own semantics for prototype parity).

### 2.11 sokol_gfx, bgfx, raylib (thin multi-backend layers)

* **sokol_gfx** (`sokol/sokol_gfx.h`, 29393 lines): backends `GLCORE, GLES3, D3D11, METAL, WGPU, VULKAN, DUMMY` (lines 20-26, 6272) and **no GLES2** (the `#error` at 6272 lists the allowed set). `sg_features` (2584-2600: `compute`, `dual_source_blending`, `draw_base_instance`, `separate_buffer_types` "(webgl2 restriction)" ...) and `sg_limits` (2604-2619) are the capability surface; resources are pool handles; `uniform_buffer_size` default 4 MB per frame (5665). A good model for a *small* backend interface; shaders are cross-compiled offline by sokol-shdc **[memory]**.
* **bgfx** (`bgfx/src`): supports `BGFX_CONFIG_RENDERER_OPENGLES` with minimum version 20 or 30 selectable (`config.h:88-98`), capability bitflags `BGFX_CAPS_*` (`include/bgfx/defines.h:478-500`), 64-bit **sort keys** `(view, draw/compute, depth|program|seq, blend, program)` (`bgfx_p.h:1330-1360`) and an API thread + render thread split. Large, with its own shader compiler (`shaderc`).
* **raylib** (`raylib/src/rlgl.h`): a batching immediate layer, backends `RL_OPENGL_11`, `33`, `ES_20`, `ES_30` and `RL_OPENGL_SOFTWARE` = `rlsw.h` (lines 432-437, 844-850), default batch 8192 elements and 256 draw calls "by state changes: mode, texture" (`rlgl.h:49-51, 203-217, 420-428`). This is the model Zinc's design doc already cites.

**Take:** the caps struct style from sokol/bgfx; bgfx's sort-key discipline for the batch planner; raylib's "same API, software fallback" promise. **Reject:** bgfx/sokol as the *only* renderer (neither gives a 2D primitive layer; sokol lacks GLES2).

### 2.12 three.js (what a "WebGL1 and WebGL2" promise really costs)

From `three/src/renderers` at package version 0.186.0:

* Context: `getContext('webgl2')` only (`WebGLRenderer.js:411`), docs line 60 "This renderer uses WebGL 2". No WebGL1 path.
* Extensions requested at init: `EXT_color_buffer_float`, `WEBGL_clip_cull_distance`, `OES_texture_float_linear`, `EXT_color_buffer_half_float`, `WEBGL_multisampled_render_to_texture`, `WEBGL_render_shared_exponent` (`webgl/WebGLExtensions.js`, `init`); `EXT_clip_control` for reversed depth (`WebGLCapabilities.js:96`).
* Core ES3 features used unconditionally: VAOs (`WebGLBindingStates.js:52`), UBOs (`WebGLUniformsGroups.js:3-26`), instancing (`WebGLBindingStates.js:169-213`), MRT/`drawBuffers` (`WebGLRenderer.js:3103-3120`), depth textures including `DEPTH_COMPONENT24/32F` (`WebGLTextures.js:273-289`), GLSL `#version 300 es` (`WebGLProgram.js:767`), 3D/array render targets (`WebGL3DRenderTarget.js`, `WebGLArrayRenderTarget.js`), MSAA renderbuffers (`maxSamples`, `WebGLCapabilities.js:114`).
* `WebGPURenderer` "falls back to a WebGL 2 backend" (`webgpu/WebGPURenderer.js:24, 41, 57, 67`), so WebGL2 is the universal floor of modern three.
* The previous major line supported WebGL1 (extension-based VAO/instancing/float textures/depth textures/MRT) **[memory: removed in r163, March 2024; treat "r162 is the last WebGL1 release" as unverified until checked on npm]**.

### 2.13 Cross-project comparison table

| Project | Does well | Core data structures | HW floor | Take for Zinc | Reject for Zinc |
|---|---|---|---|---|---|
| **GPUI** (Zed) | Few draw calls via order ranks; SDF quad/shadow; scene range replay; hitbox model; keymaps | `Scene` (8 per-kind `Vec`s of `repr(C)` primitives), `BoundsTree` R-tree (fanout 12), `Frame{scene, hitboxes, dispatch_tree}` x2, arena, `AtlasTile` | Metal/DX/Vulkan; wgpu GL/WebGL2 (`shaders_webgl.wgsl`); needs storage buffers or uint textures | primitive set, ranks, SDF math, border split, glyph key + 4 subpixel variants, range replay, two-gen text cache | Taffy/Rust, per-frame element rebuild as sole model, WebGL transport as ES2 path, oklab default |
| **gpui-component / gpui-kit** | Unstyled base + tokens, 75+ widgets, virtual list/table/dock, motion, headless tests, JS shell | `SemanticThemeTokens`, `VirtualList`, `motion::*`, `Root` | same as GPUI | tokens, variable-height virtual list, presence/stagger, `reduce_motion`, test harness | Tree-sitter editor, duplicate JS shell |
| **Skia Ganesh** | Op merging, atlas with plots, broad GL support | `GrOp` chains, `OpsTask`, `GrDrawOpAtlas` (4 pages x 32 plots) | GL, Vulkan, Metal | merge-with-limited-lookback (10), plot eviction | size, path-renderer zoo |
| **Skia Graphite** | Painter's order compression + depth, analytic RRect/blur steps, sparse strips | `DrawOrder{paintersDepth, compressedOrder, stencilIndex}`, `BoundsManager`, `RenderStep`, `SortKey` | Metal, Vulkan, Dawn (no GL) | ordering theory, analytic steps | whole library |
| **react-native-skia** | Declarative scene to recorded commands, native replay, animation patches without JS | JS `Command[]` + native `Recorder` with variable slots | RN + Skia Graphite/Dawn | record/patch/replay with property slots; declarative canvas JSX | Skia dependency, worklet threading |
| **react-native-webgpu** | Faithful WebGPU object model in JSI over Dawn; device sharing with Skia | `GPU*` host objects, `JSIConverter`, runtime-context promises | Dawn (Metal/Vulkan/D3D12) | blueprint for `zinc:webgl`/`zinc:webgpu` bindings; pin GPU lib to a known milestone | Dawn as default |
| **Impeller** | Offline shaders, pipeline cache, `UberSDF`, draw-order resolver, GLES2-floor backend with quirks table | `Contents`, `Geometry`, `EntityPass`, `DrawOrderResolver`, `ContentContext` | Metal, Vulkan, GLES2+ | quirks table, caps by proc availability, uber SDF, reverse-order opaque | display-list coupling |
| **WebRender** | Batch keys + features, tile cache with hashed invalidation, GPU cache eviction, swgl | `BatchKey`, `PrimitiveBatch`, `TileCacheInstance`, `GpuCache` | GL 3.2+/GLES3 | tile cache for static/scrolling layers, batch feature flags | vertex-texture transport, MPL code reuse |
| **Vello** | Sparse strips CPU/GPU; WebGL2 without compute; layer scheduler; probe | `Tile 4x4`, `Strip`, wide tiles, schedule DAG | CPU / WebGL2 / wgpu / compute | sparse-strip path coverage, probe, page scheduling | Rust, compute renderer |
| **Dear ImGui** | Minimal backend contract; dynamic atlas; fringe AA; user callbacks | `ImDrawList{VtxBuffer, IdxBuffer(16-bit), CmdBuffer}`, `ImDrawCmd`, splitter | any GPU incl. GL2 | triangles+scissor+texture as universal fallback; callbacks | immediate API |
| **LVGL** | Partial refresh with bounded dirty list and joining; draw units; tiny RAM | `lv_draw_task_t`, `lv_draw_unit_t{evaluate_cb, dispatch_cb}`, `inv_areas[32]` | MCU, no GPU required; many accelerators | dirty-area joining, strip rendering, accelerator hook, RGB565/A8/I1 | widget model/styling |
| **sokol_gfx** | One header, small caps/limits, 6 backends | pools, `sg_features`, `sg_limits` | GLCORE, **GLES3**, D3D11, Metal, WGPU, Vulkan (no GLES2) | candidate T4 layer; caps style | no GLES2/WebGL1 |
| **bgfx** | Sort keys, GLES2 option, API/render thread | `Frame`, `SortKey`, `BGFX_CAPS_*` | GLES2.. to D3D12/Metal/Vulkan | sort-key packing | heavy, own shader compiler, 3D-first |
| **raylib/rlgl** | Simple batching, software `rlsw` | `rlRenderBatch`, `rlDrawCall` | GL1.1..3.3, ES2/3, software | "one API, software fallback" | no rich 2D |
| **three.js** | The WebGL ecosystem | `WebGLRenderer`, `WebGLState`, programs cache | WebGL2 (r186 tree) | compat tests, extension list | WebGL1 in the current tree |

---

## 3. Cross-cutting lessons

1. **Everyone separates "recording" from "drawing" with a POD list.** Recording is cheap and retained, drawing is a pure function of the list. That makes golden tests, remote displays (`display-remote`), capture, and the web (wasm memory read by JS) possible.
2. **Overlap-aware ordering is the batching key.** GPUI/Graphite/Impeller/WebRender derive batches from bounds, not from the painter's list. Zinc measured the cost of not doing it.
3. **SDF in the fragment shader beats tessellation for rectangles, shadows and glyphs; tessellation + fringe wins for general paths on hardware without derivatives;** sparse-strip/atlas coverage wins for heavy vector content.
4. **The atlas is half of the renderer.** Key (font, glyph, size, subpixel), plot eviction, per-frame dirty upload, separate monochrome and colour pages.
5. **Capability data must come from the driver and be overridable by a quirks table** (Impeller `capabilities_gles.cc`, Vello probe, Zinc's own VC4 hang hazard).
6. **Tiny targets win by not storing the frame**: LVGL strips, Zinc's band rasterizer; the scene is small and the *diff* is hashed.
7. **JS bindings of a GPU API are a solved pattern** (react-native-webgpu), and Zinc already ships the script engine.

---

## 4. Proposed architecture for Zinc

Names are proposals. "Scene" below is the successor of `raster::Frame`, keeping its 10 kinds as the v1 subset.

### 4.1 Layers

```
 zinc:ui / kit / Solid / React (JSX)       zinc:canvas, svg, lottie        zinc:three / zinc:3d / zinc:webgl (script)
        |  retained node tree (SoA)               | paths                           | 3D viewport
        |  layout, hit-test, animation slots      |                                 |
        +---------------------+-------------------+---------------------------------+
                              v
                     SceneRecorder  (frame arena, no malloc)         <-- GPUI: Window + Scene
                              v
          Scene IR  (POD, versioned, serialisable; per-kind arrays; layers; slots; resource table)
                              v
        Prepare(caps)   damage diff | order ranks | batch plan | atlas residency | tile bins      <-- shared code, parameterised by Caps
                              v
    +-------------+-------------+--------------+----------------+-----------------+----------------+
    | SwBackend   | ConsoleGpu  | Gles2/WebGL1 | Gles3/WebGL2   | Native (T4)     | Remote/Capture |
    | band/tile   | PS1 GP0,    | expanded     | instanced,     | Metal/Vulkan/   | scene stream   |
    | float / fx  | PS2 GS      | quads, ES2   | UBO, arrays    | D3D via 1 lib   | to JS / net    |
    +-------------+-------------+--------------+----------------+-----------------+----------------+
```

Invariants: (1) the software backend is the reference and is available on every host; (2) GPU backends are accelerators that must match it within a tolerance policy (4.17, section 6); (3) no layer above the Scene knows which backend runs.

### 4.2 Scene IR

**Primitive kinds** (superset of the current `Kind`; each is a fixed-size POD record in a per-kind array, GPUI-style):

| Scene kind | Replaces / adds | Notes |
|---|---|---|
| `Clear` | `CLEAR` | |
| `Quad` | `RECT`, `BORDER`, fill+border of rounded rects | bounds, 4 radii, 4 border widths, fill paint, border paint, alpha, flags (dashed, inset). Paint = solid / linear / radial now, N stops via ramp later. Subsumes `grad` modes 0-3 of `Cmd` |
| `Shadow` | `SHADOW` | adds inset flag and spread as in GPUI |
| `GlyphRun` / `Sprite` | `TEXT` | the run form (`off, n`) stays the recording form (cheap, small on T0); expanded to one record per glyph in Prepare for GPU backends |
| `Image` | `IMAGE` | `res` id, uv rect, radius, filter flag, `version` (exists as `c2`) |
| `Path` | `LINE`, `POLY` | contours in the point pool; paint record (`grad == 4` today); fill rule bit (exists as `pad` bit 0); stroke flag so a backend can use its own stroker; tessellation cached by payload hash |
| `Mesh` | new (design doc section 7 `MESH`) | retained geometry handle + 2D affine + alpha, for maps/graphs |
| `Surface` | new | external texture (video, camera, 3D viewport, `webgl` canvas) with size, version, filter |
| `ClipPush` / `ClipPop` | `CLIP`, `UNCLIP` | rect, rounded rect (radius), later path; backends choose scissor / stencil / corner restore (exists) |
| `LayerPush` / `LayerPop` | new | opacity, blend mode, optional `cache_key` (tile cache hint), `isolated` flag; GPUI's `push_layer` reserves one order for a group (`scene.rs:75-80`) |
| `Custom` | new | callback id + state-reset contract (ImGui `AddCallback`), for embedding a GL view |
| `Transform` | new | 2x3 affine applied to following primitives until pop; today `ui.ts` bakes `scale/translate` on the CPU (`ui.ts:431-439`); GPUI sprites carry a `TransformationMatrix` (`scene.rs:608-700`) |

**Two encodings, one schema [proposal]:**

* *Wide* (T2-T4): 32/48/64-byte `repr(C)` records identical to the vertex/instance layout (no padding bytes, like GPUI `PaddedBool32`), uploaded with `memcpy`. Coordinates f32.
* *Compact* (T0/T1): 16-24-byte records, int16 pixel coordinates (screens up to 32767 px), RGB565 or palette colours, text as `(off, n)`. Selected at build time by the profile (the recorder is a template over coordinate/colour types; the AOT compiler already specialises per profile). The diff keeps `(hash32, bounds i16 x4)` = 12 bytes per command of the previous frame instead of a full second command list (today a second 48-byte `Cmd` array: `gfx.cpp:70`).

**Frame contents:** per-kind arrays, one point pool, one text pool, `slots[]` (animatable floats, 4.8), `layers`, `damage` (up to 8 rects like today), resource table (fonts, images, dyn images with `version`), `frame_id`, `viewport`, `pixel_scale`.

**Versioning/serialisation:** a `u32 scene_version` and a self-describing header so `zinc capture --scene`, `display-remote`, the wasm-to-JS renderer and goldens share the stream.

### 4.3 Ordering rules

* Painter's order is the semantic. `Scene::finish()` (GPU backends only) assigns ranks: `rank(p) = 1 + max{ rank(q) : q recorded earlier, bounds(q) ∩ bounds(p) ≠ ∅ }`, using bounds clipped by the active clip (GPUI `scene.rs:87-101`). Implementation: a flat-array R-tree with fanout 8-16 and the "max leaf" shortcut (`bounds_tree.rs:11-35, 116-195`), reusing scratch storage per frame (GPUI keeps `insert_path`/`search_stack` vectors, `bounds_tree.rs:29-37`). Cost model: O(n log n) with n up to a few thousand; **measure on real frames before committing (spike S1)**.
* Layers: a `LayerPush` takes one rank for the group (GPUI semantic) unless the layer has non-trivial blend/opacity, in which case the backend renders it to a texture (or applies the opacity per primitive if it is a single primitive; Zinc's current per-command `alpha`).
* Within a rank, draw in `(kind, texture page)` order. Across ranks, strictly ascending. This is the GPUI/Graphite contract and it is **exact** (no approximation) because equal ranks never overlap.
* Opaque culling [optional, T2/T3]: draw ranks' opaque quads in reverse with depth test, as Impeller (`draw_order_resolver.h:13-45`) and WebRender's opaque list do. Only worth it where overdraw dominates; VC4 is a tile renderer with early-Z but a depth buffer costs bandwidth: **measure (S4)**.
* The software backend ignores ranks; it replays commands in paint order per band/tile, as today.
* Clips: a clip is part of every primitive's `content_mask` for ranking (GPUI stores the mask in each primitive). GPU backends convert nested rect clips into per-primitive clip rects in the instance data (GPUI's clip distances, `shaders.wgsl:192-208`) so a clip does not break a batch; rounded clips go to a stencil path (T3+) or the existing corner-restore trick (T2, `ZRT_CLIP_CORNER_PX`).

### 4.4 Batching keys

`BatchKey = (rank, kind, atlas page or texture id, blend, shader feature mask)`, sorted with a bgfx-style 64-bit key (`bgfx_p.h:1330-1360`). Rules:

1. Same key and contiguous after sorting: one draw.
2. Feature flags instead of key breaks (WebRender `BatchFeatures`, `batch.rs:515-530`): a solid-quad batch with no rounded corner uses the flat fast path unless one quad needs a radius; choose the shader per batch from the OR of the features.
3. T2 has no dynamic sampler indexing: up to 4 atlas pages are bound at once and the page is chosen by an `if` chain on a per-vertex index; T3 uses a `sampler2DArray` with the page as an attribute, so **atlas page switches never break a batch** (GPUI breaks on `texture_id`, `scene.rs:392-401`; Graphite binds up to 4 pages, `DrawAtlas.h:142`).
4. Lookback merge (Ganesh `kMaxOpChainDistance = 10`, WebRender `lookback_count`) is only needed when ranks are not computed (T0/T1 backends that draw in painter order).
5. Splitting: border-only quads become 4 strips; large rounded fills become `solid interior + rim quads` so interior pixels skip the SDF (GPUI `window.rs:4598-4660`; Zinc phase 1b "quad split" already does it in GL). Do this in shared `Prepare`.

**Draw-call budget** (to verify, section 5): hero Home/Kit/Gallery <= 40 draws; any single example <= 120 on T2/T3.

### 4.5 Resources and atlases

* **Glyph atlas**: key `GlyphKey{font_id, glyph, size_px (quantised 1/4 px at T3+), subpixel_x (0..3, T3+ only, else 0), flags}`; A8 pages (R8 on ES3/WebGL2/desktop, `GL_LUMINANCE` on ES2/WebGL1, already used and validated on vc4) and an RGBA page for emoji/colour glyphs; page size 1024x1024 default (GPUI `wgpu_atlas.rs:188-190`), 2048 on T4; bucketed shelf allocator with plot-granular eviction and a per-frame "used" stamp (Skia `GrDrawOpAtlas`: 32 plots, 4 pages); a full atlas triggers eviction of plots unused for N frames and, failing that, a mid-frame flush + clear (never a crash). Uploads: dirty rects merged per page, one `glTexSubImage2D` per page per frame.
* **Baked glyphs on T0/T1**: glyph bitmaps live in flash (existing `Font.bitmap`, about 80 KiB of baked glyphs in the PS1 breakout build); the PS1/PS2 backends copy used glyphs into VRAM/GS memory once (4-bit CLUT on PS1).
* **Images**: baked images upload once (existing), `dyn` images by `version` (existing `image_version`), with an upload budget per frame; mipmaps only on T3+ (ES2/WebGL1: NPOT textures cannot use mips or repeat, so atlas pages are POT and large images are tiled or downscaled).
* **Retained geometry** (`Mesh`): one static VBO per handle; the CPU backend rasterizes the same triangles.
* **Gradient ramps**: 1x256 RGBA ramp textures (Impeller: "pre-baked gradient ramp texture" vs SSBO, `uber_sdf_contents.h`), keyed by stop-list hash; solid and 2-stop gradients stay analytic.
* **Resource lifetime**: all GPU objects are labelled and owned by the backend; context loss (WebGL `webglcontextlost`, EGL context lost) drops everything and rebuilds from CPU copies (GPUI does `atlas.clear()` and retries after repeated GPU errors, `wgpu_renderer.rs:~1140-1170`).

### 4.6 Damage and dirty regions

Four levels, because the tiers need different things:

1. **Command-diff damage (T0, T1, software, e-ink)**: keep `diff_rects` (`raster.cpp:568-620`) and extend with the LVGL rules: bounded list, join when `area(union) < area(a) + area(b)` (`lv_refr.c:634-665`), overflow -> whole screen. T0 uses the hash-only variant (4.2). Idle frames stay `keep()`.
2. **Scene range reuse (CPU record cost, all tiers)**: each retained UI node (or "view boundary") remembers the `[start, end)` ranges of its primitives in the previous Scene plus a dirty bit; a clean subtree whose `(bounds, clip, transform key, text style key)` is unchanged is replayed by `memcpy` (GPUI `reuse_prepaint/reuse_paint`, `window.rs:3910-4000`, `scene.rs:141-149`). Note that the 11 ms `paint` in `render-perf-options.md` for the navigation example is *application* paint (map projection), so it needs the `Mesh` primitive more than node caching; both are in the roadmap.
3. **GPU scissor / buffer age (T2+, optional)**: replay only the damage rectangles over a persistent target (`EGL_KHR_partial_update` / `EGL_EXT_buffer_age`, WebGL `preserveDrawingBuffer`), else full replay with idle skip (current behaviour). Given the recorded VC4 hang on partially changing screens this is **off by default and gated by a stress spike (S2)**.
4. **Retained layer tiles (T2/T3, optional)**: WebRender-style tiles for static or scrolling content: a `LayerPush` with `cache_key` (hash of its primitive range) is rendered once into a tile texture and blitted while the key matches (`picture.rs:266-271, 749-771, 1761`). Worth it only when fill rate is the bottleneck (Pi at 1080p).

### 4.7 Text pipeline

* **Shaping** behind one interface (`TextLayout`): T3/T4 HarfBuzz + SheenBidi + libunibreak (already ZN-114/ZN-165); T0-T2 simple advances with the existing 26.6 `text_advance`. The result is a `GlyphRun` (glyph ids, x positions in 26.6, font, size).
* **Layout cache**: content-hash keyed, two generations (GPUI `line_layout.rs:458-480`), allocation-free lookup by hash; invalidated by font generation.
* **Rasterization**: stb_truetype (D11) into the atlas on the logic thread, never on the GPU thread (existing rule, `gpu-renderer-design.md` section 5); baked fonts on T0/T1.
* **Positioning and parity**: integer origins and nearest sampling on T0-T2 and when `text.quality = "parity"` (default), so GL output matches the prototype goldens (`gpu-renderer-design.md` section 11 "Text fidelity"). `text.quality = "high"` on T3/T4 enables 4 subpixel x-variants (GPUI), optional LCD text (dual-source blending where available, `wgpu_renderer.rs:686-699`) and fractional sizes; it has its own golden set.
* **SDF/MSDF text**: not now. Skia has SDF text steps (`graphite/render/SDFTextRenderStep.*`), which matter for `scale` transforms ("Text in a scaled view uses the nearest baked font size", `docs/ui.md`). Revisit after the atlas exists (R7.3).

### 4.8 Layout, animation and invalidation

**Layout engine choice [decision]: keep Zinc's flexbox as the semantic reference; do not adopt Taffy or Yoga.**

* Taffy is Rust (GPUI `taffy.rs`); the engine is C++20 with `zig c++` cross builds and no Rust toolchain. A C++ port exists inside `gpui-kit-cpp/src/taffy` but is unlicensed.
* Yoga (C++, MIT **[memory]**) has no grid and different rounding; adopting any engine changes pixels, and M10's requirement is "every demo unchanged" (`RESUME.md`, ZN-113).
* The real problems are performance and allocation, not features: `measure()` allocates arrays per node and relayouts the whole tree when `layoutDirty` flips (`ui.ts:845-870, 948-957`).

Plan: re-implement the same algorithm in typed, allocation-free Zinc code over **SoA node storage** (parallel arrays indexed by handle: `lw[], lh[], x[], y[], flags[], parent[], firstChild[], nextSibling[]`), with (a) **relayout boundaries** (a node with fixed width and height, or fixed `overflow`, stops dirty propagation, as in Flutter/Yoga dirty bits); (b) a **measure cache** keyed by `(available w, available h, mode)` per node (Yoga's trick); (c) differential tests proving the output boxes equal the old `ui.ts` on all examples; (d) grid as an additional display mode later (the one thing Taffy gives). Taffy and Yoga stay useful as test **oracles** only.

**Animation and invalidation [proposal]:** three dirty classes per node:

| Class | Meaning | Cost |
|---|---|---|
| layout-dirty | size/flow input changed | relayout up to the boundary, then re-record |
| paint-dirty | colours/text/shape changed, geometry same | re-record this node's range |
| slot-dirty | animated number only (transform, opacity, scroll offset, colour lerp) | **no re-record**: write the float into `slots[i]` and set damage = union(old bounds, new bounds) |

Recorded primitives reference slots (`transform_slot`, `alpha_slot`, `color_slot`), exactly the react-native-skia model where the recording has variables and a mapper writes values without re-rendering React (`Container.native.ts:57-83`, `RNRecorder.h:42-70, 497`). Engine animations already exist (`docs/ui.md`: "Imperative `ui.setNumber`/engine animation values sit above the stylesheet"); scroll physics (`ScrollAxis`) becomes a slot writer. The backend reads slots at draw time (uniform / per-instance patch on GPU, direct read on CPU), so a 60 fps scroll or fade costs one frame of GPU time and about zero CPU record time.

GPUI mapping: `cx.notify()` = a signal write marking `paint-dirty`; `observe` = an effect; `dirty_views` = the dirty node set; a *cached view* = a Solid `<Memo>`/keyed subtree with a range cache. Zinc's signals (`zinc:signals`, Solid/React hosts) already give fine-grained invalidation, so the GPUI entity store does not need to be ported.

### 4.9 Hit testing and input

Keep the existing arbitration (`ui.ts` pointer capture, `onDrag/onPinch/onTap`, scroll grabs, layers, keymaps); it is richer than GPUI's and tested. Add a flat **hit region array** (SoA: bounds, clip, behavior `{Normal, Block, BlockExceptScroll}`, node id) written during record in paint order and scanned in reverse, as GPUI `Frame::hit_test` (`window.rs:1163-1185`); rebuilt only for re-recorded ranges (range reuse copies them). Linear scan is fine to a few thousand regions; add a uniform grid beyond that. This also gives e-ink and remote displays an input map independent of the retained tree. Run it in shadow mode against the existing `hit()` first (S17).

### 4.10 Render backend interface [proposal]

```cpp
namespace zn::gfx {
enum class Tier : uint8_t { T0, T1, T2, T3, T4 };
struct Caps {                       // filled from the driver, then patched by a quirks table (Impeller capabilities_gles.cc)
  Tier tier; char api[16]; char renderer[64];
  uint32_t max_texture, max_vertex_attribs, max_varying_vectors, max_frag_uniform_vectors;
  bool highp_frag, derivatives, instancing, vao, ubo, uint_tex, texel_fetch, tex_array, mrt, float_tex, depth_tex,
       msaa4, npot_mips, index32, srgb_fb, dual_source, partial_present, timer_query;
  uint32_t vram_budget_kb, upload_kb_per_frame;
};
struct Backend {
  virtual Caps caps() const = 0;
  virtual bool begin(const FrameInfo&) = 0;                       // false = skip (surface lost, throttled)
  virtual void draw(const Scene&, const DamageSet&, FrameStats*) = 0;
  virtual void present() = 0;                                     // paced; waits for the previous flip at the next call
  virtual bool read(RectI, uint32_t* rgba) = 0;                   // golden capture (ZINC_SHOT / frame hash)
  virtual void lost() = 0;                                        // context loss: drop GPU state, keep CPU copies
  virtual ~Backend() {}
};
}
```

`Prepare(caps)` (shared C++, parameterised by `Caps`) turns a Scene into a plan: damage, ranks (GPU backends), batches, atlas residency. `draw()` executes a plan. Selection reuses `"renderer": "cpu" | "gl" | "auto"` (existing) plus `"tier": "auto" | "T0".."T4"` for forcing a lower tier in tests. LVGL's `evaluate_cb`/`dispatch_cb` becomes an `AcceleratorUnit` hook on the SW backend for 2D DMA engines (STM32 DMA2D, ESP32-P4 PPA **[memory for PPA]**).

### 4.11 Backends

**(a) SW band/tile (all tiers; reference).** Evolve `raster.cpp`:
* per-band command binning (today each band walks all `f.count` commands, `raster.cpp:489-492`) so cost is O(bands touched), needed past about 2k commands; 64x64 tiles on hosts, 6-16 row bands on SPI panels;
* native RGB565 render target for T0 (halves the band buffer; today bands are `0x00RRGGBB` `uint32_t` converted in place, `st7789.cpp:33-36`), A8/I1 targets for e-paper;
* an **fx12/fx16 template** of the same algorithms for PS1 (integer SDF with a per-radius quarter-circle coverage LUT, no sqrt) and for ESP32 (no hardware double); the oracle for parity is the float path with a tolerance (4.17);
* NEON/SSE spans for solid fills and blends on T2-T4 hosts (Vello CPU's `fine` stage and swgl are reference designs, but implemented in our own small C++);
* path coverage: the current scanline polygon fill stays; for heavy vector plugins use ThorVG (already chosen in ZN-106). Vello's sparse strips are the model to copy if profiling demands it (R7.4);
* multi-thread bands via `render_bands.h` (done).

**(b) GLES2 / WebGL1 (T2).** The existing phase-1 renderer, hardened:
* vertex expansion: 4 vertices per primitive (position, local uv/size, packed params, colour) in a dynamic VBO ring of 3 segments (never touch a buffer in flight; orphan with `glBufferData(NULL)` when the ring wraps), a static 16-bit index buffer of quad patterns (0,1,2,2,1,3 ...), at most 16384 quads per draw (ImGui's 16-bit index limit, `imgui.h:3205-3211`); `OES_element_index_uint` only if present;
* optional instancing through `ANGLE_instanced_arrays`/`EXT_instanced_arrays` when `caps.instancing` (Impeller `buffer_bindings_gles.cc:249-258`), cutting upload bytes about 2.5x (64-byte instance vs 4 x 40-byte vertices);
* shaders in GLSL ES 1.00 dialect, `highp` in the fragment stage only if `GL_FRAGMENT_PRECISION_HIGH`, **no derivatives** (vc4 lacks `GL_OES_standard_derivatives`, `gpu-renderer-design.md` Phase 1 validation): AA from a `pixel_size` uniform; paths via CPU tessellation with an ImGui-style AA fringe (`imgui_draw.cpp:1087-1110`) or MSAA where `caps.msaa4`;
* atlas textures: A8 as `GL_LUMINANCE`, POT pages, `GL_CLAMP_TO_EDGE`, no mips; up to 4 pages by `if` chain;
* **blending in gamma space** (no sRGB framebuffer on ES2) to match the CPU rasterizer's `>> 8` blend; this is a contract, document it;
* no VAO (`OES_vertex_array_object` optional): re-specify attributes per pipeline change and reset divisors (Impeller note);
* tile-based GPU rules (VC4, Mali, Apple): one render pass per frame, `EXT_discard_framebuffer`/`glInvalidateFramebuffer` at frame start, avoid framebuffer switches (each flushes a tile pass, `gpu-renderer-design.md` section 11);
* direct replay into the window buffer (phase 1b) instead of render-to-texture + present pass, and wait for the previous page flip at the *next* swap (the measured pacing fix);
* quirks table keyed by `GL_RENDERER` + version string; boot **probe** renders six known 64x64 scenes and compares with the SW result (Vello `probe.rs` idea); mismatch or timeout disables the feature or the whole GL path and falls back to SW with one log line (existing `renderer: auto` rule). Every GPU experiment on vc4 runs under `timeout -s KILL` with the reset counter checked (existing rule).

**(c) GLES3 / WebGL2 (T3).** Same code base, `#version 300 es`, `#define ES3`:
* instancing with a unit-quad VBO + per-instance buffer (or GPUI's 4-vertex strip `draw(0..4, first_instance..)` with a `texelFetch` over an `RGBA32UI` instance texture, the WebGL2 transport GPUI itself ships in `shaders_webgl.wgsl`), VAOs, UBOs for global parameters;
* `sampler2DArray` atlas pages; `R8`/`RG8` formats; `dFdx/dFdy` analytic AA for paths (GPUI's Loop-Blinn `(s,t)` path pass, `shaders.wgsl:1050-1112`) rendered into an intermediate target, MSAA renderbuffers via `glRenderbufferStorageMultisample`;
* rounded clips via stencil;
* WebGL2 specifics: no storage buffers, no compute; extensions queried, never assumed (`EXT_color_buffer_float` etc., as three does).

**(d) Native modern (T4).** Two realistic options, decided by spike S6 (same 6-primitive scene):
1. **sokol_gfx** (zlib, single header; Metal, D3D11, GLCORE, GLES3, WGPU, Vulkan; `sg_features`/`sg_limits`; `sokol_gfx.h:20-26, 2584-2619`). Pros: small, C, matches Zinc's size philosophy, one shader source via offline cross-compile. Cons: no GLES2/WebGL1 (irrelevant, T2 is ours), shader tooling is a separate binary.
2. **Dawn / wgpu-native** (WebGPU API). Pros: same API as react-native-webgpu, Skia Graphite and the browser's `navigator.gpu`; a single WGSL shader source (GPUI's `shaders.wgsl` proves it, with a WebGL variant). Cons: tens of MB, heavy C++ or Rust build.
The existing macOS GL 3.2 path (SDL3) keeps working until the native backend is better. ANGLE is a third option for running the GLES code on Metal/D3D **[memory: BSD-licensed, Google]**, and would also be the path to a conformant `zinc:webgl` on macOS.

**(e) T0 extreme low memory (ESP32, SPI/i80 panels).** Budgets in 4.13. Mechanisms: compact scene, hash diff, bands of 6-16 rows rendered into one band buffer and converted in place (existing), DMA ping-pong when RAM allows, RGB565 native raster, flash-resident glyph bitmaps (A4 optional), image RLE, LVGL-style joined dirty areas. SPI bandwidth is the real ceiling: 240x320 x 2 B = 307,200 B per full frame; at 40 MHz single-line SPI (5 MB/s) that is 61 ms (16 fps), and at the board file's `hz: 10000000` on an 8-bit i80 bus (about 10 MB/s if one byte per WR cycle, **to verify against the panel timing**) 31 ms (`boards/esp32-2432s022.json`). So damage-only updates are a requirement, not an optimisation.

**(f) T1 consoles (PS1 and PS2), the fixed-point path.** These do not need a pixel shader; they need a *primitive mapper*. Hardware facts below are **[memory, not from repository files]**:
* **PS1**: 1 MiB VRAM (1024x512 x 16 bpp), GP0 command packets via an ordering table (linked-list DMA), flat/Gouraud triangles and quads, textured primitives (4/8/15-bit, 256-wide texture pages, affine mapping, CLUT), sprites and tiles, four semi-transparency modes, rectangular drawing area (clip), no Z-buffer, no anti-aliasing; GTE only for 3D. Scene mapping: `Quad` square fills -> `TILE`/`POLY_F4`; vertical/horizontal gradients -> `POLY_G4` (free Gouraud); rounded corners -> pre-baked corner sprites (9-slice) in VRAM, or a 4-6 segment fan; shadows -> semi-transparent 9-slice textures; glyphs -> `SPRT` from a 4-bit CLUT atlas; images -> textured quads; `ClipPush` -> drawing-area rectangle only (rounded clips degrade to rectangles); `Path` -> fixed-point tessellation into triangle fans/quads (no AA); alpha -> semi-trans mode where it maps (0.5/1/-/0.25), otherwise pre-blended solid colour for flat backgrounds. The existing profile gives `fx12`, 256 KiB heap, a 320x240 15 bpp double buffer (300 KiB of VRAM) leaving about 700 KiB for atlases (`docs/targets/playstation.md`).
* **PS2**: GS with 4 MiB eDRAM, accepts sprites/triangles/lines with per-primitive alpha and texture mapping, Gouraud for free, scissor rectangle, 8/4-bit CLUT; the EE/VU1 build GIF packets. Mapping: axis-aligned fills and glyphs as `SPRITE`, gradients as Gouraud sprites, rounded corners and shadows as textured 9-slice sprites, rect clip as `SCISSOR`. The current HAL rasterizes the whole frame into a CT32 texture and draws one sprite (`hal_ps2.cpp`), wasting the GS.
* Both keep the **SW fx rasterizer** as fallback and oracle (also what the emulators in CI run; PS2 is build-only without a BIOS: D4/ZN-137).

**(g) Remote/Capture.** The Scene stream is also the format of `display-remote` and of the web renderer (4.12): a backend that serialises and a JS reader that draws.

### 4.12 The web

Today: canvas 2D present of a software frame (`hal_web.cpp`). Proposal:

* **wasm records the Scene into linear memory; a roughly 500-1000 line JS file issues all WebGL calls** (WebGL1 and WebGL2 paths in the same file, extension-gated), once per frame (`requestAnimationFrame`). No per-GL-call wasm-to-JS crossing, no Emscripten GL glue (ZN-135 is "wasm target without emscripten"), and the same POD stream serves capture and goldens. The JS draws with the T2 (expanded quads, WebGL1) or T3 (instanced, WebGL2) strategy by `caps`. Software canvas-2D remains the fallback when `getContext('webgl')` fails.
* WebGL1 specifics to handle: no `texelFetch`/integer textures (GPUI's WebGL transport cannot be used), instancing only through `ANGLE_instanced_arrays`, `OES_vertex_array_object` optional, depth/float textures via extensions, NPOT limits, context-lost events.
* Browser testing: headless Chrome with SwiftShader/ANGLE can force `webgl` vs `webgl2` contexts, so both are covered in CI.

### 4.13 Capability tiers, degradation and budgets

Tier is a floor the *kit and examples may assume*; backend is chosen per device. Numbers are budgets to enforce in tests, derived from existing measurements where one exists and otherwise **proposals to validate**.

| | **T0 MCU** | **T1 fixed-function console** | **T2 GLES2 / WebGL1** | **T3 GLES3 / WebGL2** | **T4 modern desktop** |
|---|---|---|---|---|---|
| Hardware | ESP32 (no GPU), SPI/i80 panels, 160 KiB Zinc heap (`cli.ts:40`) | PS1 (2 MiB RAM, 1 MiB VRAM, no FPU), PS2 (32 MiB, GS 4 MiB) | Pi 1/2/3 VideoCore IV, old Android, WebGL1 browsers | Pi 4/5 (GLES 3.x via Mesa **[memory]**), modern mobile, WebGL2 | Metal, Vulkan, D3D12, GL 4.x |
| Backend | SW band, RGB565, compact scene | SW fx fallback; GP0 / GS primitive backends | GL ES2 expanded quads; SW fallback | GL ES3 instanced; WebGL2 JS renderer | sokol/Dawn/GL; SW |
| Number type | f32 / fx | fx12 (PS1), f32 (PS2) | f32 | f32 | f32 |
| Scene capacity | <= 160-256 cmds, 2-4 KiB points | <= 512 cmds (PS1 today), 8192 (PS2) | 8192 cmds | 65536 cmds | 1M |
| Scene RAM | <= 16 KiB (single list + 12 B/cmd hash) | <= 72 KiB today (PS1) -> about 36 KiB with hash diff | <= 1 MiB | <= 8 MiB | <= 64 MiB |
| Band/target RAM | 240 x 6..16 rows x 2 B = 3..8 KiB (+ DMA buffers) | VRAM framebuffers 300 KiB (PS1) | window buffer + atlas | + MSAA | |
| Atlas/texture budget | 0 (glyphs in flash) | PS1 about 700 KiB VRAM (256x256 4-bit CLUT atlas = 32 KiB); PS2 about 1 MiB GS | A8 1024^2 (1 MiB) + RGBA 1024^2 (4 MiB) | 2048^2 pages, arrays | 4096^2, 64+ MiB |
| Frame target | 30 fps UI, damage-only | 60 vblank (30 for busy) | 60 at 800x480, 30 at 1080p | 60-120 | 120+ |
| CPU budget per frame | layout+record <= 8 ms of 33 | record <= 6 ms of 16.7 | record+prepare <= 4 ms, GPU <= 10 ms | record+prepare <= 2 ms (5k prims), GPU <= 4 ms | <= 1 ms |
| Draw calls | n/a (bands) | OT packets <= 1-2k | <= 120 (<= 40 typical) | <= 60 | <= 60 |

What degrades, by feature (each rule is deterministic and logged once at start through `zinc doctor` / a startup line):

| Feature | T0 | T1 | T2 | T3 | T4 |
|---|---|---|---|---|---|
| Rounded rect AA | SDF LUT, 8-bit coverage | baked corners / fan, no AA | SDF, `pixel_size` AA | SDF | SDF |
| Shadows | box approximations (2-3 rings) or none | pre-baked 9-slice | analytic blur | analytic blur | analytic blur |
| Gradients | 2 stops, linear/radial integer | vertical/horizontal Gouraud only; radial -> banded rings | analytic 2-stop; ramp texture N stops | + SSBO/ramp | + oklab opt-in |
| Rounded/non-rect clips | rect + corner restore (budgeted) | rect only | corner restore (<= 32 px radius) | stencil | stencil |
| Opacity groups | per-primitive alpha only | per-primitive / semi-trans | offscreen layer if needed | offscreen layers | offscreen + filters |
| Blend modes | normal | normal + 4 hw modes | normal, add, multiply | all Porter-Duff | + advanced |
| Paths | scanline fill, no AA or 1-bit coverage | tessellated, no AA | tessellated + fringe or MSAA | Loop-Blinn + MSAA | + sparse strips (R7.4) |
| Text | baked bitmaps, integer origin | CLUT atlas, integer origin | atlas, integer origin | atlas, subpixel x4 opt-in | + LCD, SDF opt-in |
| Images | nearest / bilinear on CPU | CLUT/15-bit, nearest | filtered, no mips | mips, arrays | mips, compressed |
| Video / camera | n/a | n/a | `dyn` image upload | + external textures | zero-copy |
| 3D | `zinc:3d` software, 16-bit Z | `zinc:3d` software fx | GL (WebGL1 subset) | WebGL2 full | WebGL2 + WebGPU |

Limit-handling rule: every backend exposes `Caps`; every feature has a *named fallback* (the table); if a Scene needs more than a tier supports (too many commands, point pool full: existing warning "extra shapes are dropped this frame", `gfx.cpp:691`), the recorder reports a counter and drops the lowest-priority primitives, never corrupts the frame. A CI job renders the "feature matrix" scene (B10) at each forced tier and compares with per-tier goldens (section 6).

### 4.14 Three.js and WebGL on top

**Layering [proposal]:**

```
three.js (unmodified JS)  ->  zinc:webgl (WebGL1/WebGL2 RenderingContext host objects)  ->  GL backend (ES2/ES3) or browser WebGL
        ^                                                                                         |
   zinc:script (QuickJS-ng, ZN-103)                                  3D result -> Surface primitive in the Scene (4.2)
```

* On **web**: pass-through to the browser's WebGL (real three.js runs as JS in the page; Zinc code reaches it through the JS glue). The Scene's `Surface` primitive references the canvas/texture. No polyfill needed.
* On **native**: `zinc:webgl` implements the `WebGLRenderingContext`/`WebGL2RenderingContext` API surface (about 200 functions) as host objects over the GL backend. Binding pattern: react-native-webgpu (typed objects, one converter layer, promise/lost-event plumbing, `packages/webgpu/cpp/rnwgpu/api/*`). Add `HTMLCanvasElement`, `OffscreenCanvas`, `requestAnimationFrame`, `ImageBitmap` shims. WebGL1 semantics are exactly GLES2 + validation; WebGL2 is GLES3 + validation. Keep the validation (WebGL is stricter than GL) because three.js relies on its errors.
* Tier consequences:

| three.js need (r186 tree) | GLES2/WebGL1 (T2) | GLES3/WebGL2 (T3/T4) | Verdict |
|---|---|---|---|
| `webgl2` context only (`WebGLRenderer.js:411`) | impossible | native | **T3 floor for current three**; T2 only with a WebGL1-capable older three **[memory: <= r162]** |
| VAO (`WebGLBindingStates.js:52`) | `OES_vertex_array_object` (common), else emulate in the binding layer (store attribute state per VAO object, re-issue on bind) | core | polyfill |
| Instancing (`:169-213`) | `ANGLE_instanced_arrays` | core | polyfill via ext; reject if absent (InstancedMesh unsupported) |
| UBO (`WebGLUniformsGroups.js`) | none | core | reject on T2 (WebGL2 shaders); shader rewriting is out of scope |
| MRT (`WebGLRenderer.js:3103`) | `WEBGL_draw_buffers` (rare on mobile/vc4) | core | polyfill only if ext present |
| Depth textures 24/32F (`WebGLTextures.js:273-289`) | `WEBGL_depth_texture` (16/24 unsigned) | core | partial polyfill |
| Float render targets (`EXT_color_buffer_float`, half float) | `WEBGL_color_buffer_float` / `EXT_color_buffer_half_float` | core + ext | gate by caps; three downgrades |
| `#version 300 es` GLSL (`WebGLProgram.js:767`) | needs ES 1.00 shaders | native | WebGL1-era three emits ES 1.00 |
| 3D/array render targets, MSAA renderbuffers | none | core | reject on T2 |
| `WEBGL_clip_cull_distance`, `EXT_clip_control` | none | desktop ANGLE only | optional, report absent |

* **Plugin `zinc:three` stays** as the T0/T1 and "no GPU" implementation (software z-buffer, API subset); document that it is a subset, not three.js. Share the Scene `Mesh/Surface` path so a 3D viewport sits inside the UI layout (ImGui callback model, or render to a `Surface` texture; with a shared GPU device on T4 the 2D and 3D layers can exchange textures without a copy, the react-native-skia + webgpu property).
* Memory reality: real three.js (a multi-hundred-KiB module) in QuickJS-ng needs tens of MiB and thousands of JS-to-native calls per frame; Pi 1 (512 MiB) is borderline, ESP32/PS1/PS2 are out. Measure (S7, S8).

### 4.15 How JSX, React and Solid map onto the Scene

* **Layout surface** (`<view>`, `<text>`, `<image>`, `<input>`, kit components): host calls build the retained node tree (as now, `ui.createNode`...). `StyleSheet.create` and classes lower at compile time to immutable `Style` records (`docs/ui.md`). Solid's signals write node properties directly (fine-grained, no virtual DOM); React/Inferno re-render and diff (existing). Node property writes set one of the three dirty classes of 4.8. `paint()` walks dirty ranges and records Scene primitives; `ui.openLayer` maps to a `LayerPush` with a reserved rank.
* **Declarative drawing surface** (new, react-native-skia style): `<canvas><rect/><rrect/><path/><text/><image/><group transform opacity>...</canvas>` lowers to Scene primitives with **no layout and no per-frame JS**: props bound to signals become slot references. This replaces ad-hoc `onDraw` immediate calls for static art and charts, and lets the compiler hoist all constant parts (as `StyleSheet.create` already does).
* **Immediate surface** (`zinc:gfx` calls, `canvas2d`, `svg`, `lottie`): unchanged API; they append primitives to the Scene (`gfx::emit`). A "lazy" canvas (`style={{ lazy: 1 }}`, existing) maps to a retained subtree range.
* **3D surface**: a `<three>`/`<webgl>` view = a `Surface` primitive backed by the 3D renderer's output.

### 4.16 How the typed AOT compiler helps

1. **No GC, deterministic RC** (ZN-018): a frame arena (reset per frame, like GPUI's `arena.rs`) is natural; paint can be forbidden from allocating.
2. **Closed-world layouts** (ZN-012): node fields become SoA arrays at compile time; no hidden classes, no inline caches in the hot path.
3. **Compile-time styles**: constants hoisted (`docs/ui.md`), so a node's static quad template (radii, borders, colours) is a precomputed record and only dynamic fields are patched. Classes like `rounded-lg bg-slate-800` need no runtime parsing (CSS strings are already normalized at build time).
4. **No-allocation lint [proposal, spike S9]**: an IR pass (ZN-026 infrastructure) rejects allocation, closure creation and dynamic dispatch inside functions marked `@frame` (paint, layout, record); the debug build counts allocations per frame and the benchmark asserts zero. Today's violations are known (`measure()` arrays, "Dynamic inline records/arrays still allocate").
5. **Profiles**: `number = fx12` lowering (ZN-121) makes the same Zinc layout code run on PS1; the SDF raster template reuses the same fixed-point ops (`include/zn/ops.h`).
6. **Per-profile specialisation**: the Scene record width (wide/compact), the target (RGB565 vs RGBA), and unused kinds are compile-time switches, so a T0 binary does not link tessellation, atlas, GL or shaping (ties to ZN-164 size gates).

### 4.17 Tolerance policy (summary; details in section 6)

SW vs SW (any thread count, same profile): bit-identical (already true). SW float vs SW fx: interior pixels exact, AA edge pixels within 2 LSB per channel, <= 0.5% pixels above 8. GL vs SW: interior <= 2, edge band (1 px around primitive bounds, computed from the Scene) <= 24 on vc4-class drivers (measured 9-21, `gpu-renderer-design.md` "Phase 1 validation"), whole-frame share(>8) <= 1% except frames using `Image` at fractional origins (documented 1 px shift) or text in `high` mode (own goldens).

---

## 5. Performance engineering rules

### 5.1 Rules (each testable)

1. **No heap allocation per frame** in record/prepare/draw. Frame arena only. Test: allocation counter == 0 over 600 frames of every benchmark scene (S9 enforces in AOT builds).
2. **POD, SoA, 4-byte aligned, no padding bytes**, so uploads are `memcpy` (GPUI `PaddedBool32` rule, `scene.rs:25-37`).
3. **One upload per buffer per frame**; ring of 3 segments; never write a buffer the GPU still reads; orphan when the ring wraps (GLES2); `glBufferSubData` of the used prefix only.
4. **Draw calls**: budget per tier (4.13); report `batches` and `breaks_by_reason {kind, texture, clip, blend, feature}` each frame.
5. **Overdraw**: sum of primitive pixel areas / surface area <= 2.5 on T2, <= 4 on T3/T4 for the example corpus; report per frame (computed from bounds after clip, the same bounds ranks use). Reduce with interior/rim splitting, culling by clip, opaque reverse order.
6. **SDF vs tessellation**: SDF for rect/rrect/shadow/glyph/circle/line segments; tessellation (with fringe) for general paths on T2, Loop-Blinn on T3, sparse strips later. Large rounded rects must use the interior + rim split so ALU cost scales with perimeter.
7. **Shader cost control**: flat-quad fast path (GPUI `fs_quad` early return); `BatchFeatures`; no dynamic loops in T2 fragment shaders; shadow blur samples <= 4 (GPUI); `mediump` where safe and `highp` where the SDF needs it (documented per shader).
8. **Glyph atlas**: preload ASCII + UI font sizes at start; eviction by plot age; upload coalescing; occupancy and evictions in stats; hard rule: rasterization on the logic thread, never in `draw`.
9. **Texture upload budget** per frame (T2: <= 256 KiB steady, bursts <= 2 MiB with a log; T3 <= 2 MiB; T4 <= 16 MiB), `dyn` image uploads only on `version` change, decode off-thread.
10. **Plan reuse**: when the Scene is unchanged (`keep()`), reuse the previous plan and skip prepare; when only slots changed, patch slots and redraw (no record, no sort).
11. **Frame pacing**: wait for the previous page flip at the *next* swap (measured: Home 28.5 -> 53.5 fps, `gpu-renderer-design.md` Phase 1b); budget-aware: if the previous frame missed vblank, skip optional work (shadows to flat, no atlas upload of non-visible glyphs); thermal/inactive throttles like GPUI (`window.rs:1813-1830`); idle = 0 frames (existing).
12. **Threading**: T0 single core with DMA overlap (band N+1 rasterizes while band N transmits; existing); T2 logic thread + render thread owning the GL context with a 3-slot Scene handoff (design doc section 6 phase 3); SW fallback bands on N cores (`render_bands.h`); web = main thread (OffscreenCanvas worker optional, needs cross-origin isolation for shared memory).
13. **Tile-GPU hygiene** (VC4/Mali/Apple): one pass per frame, invalidate/discard at frame start, no mid-frame framebuffer switches, no `glReadPixels` in the frame loop (capture only on request).
14. **Fallback is a feature**: any GPU error, hang watchdog (a frame > 250 ms) or probe mismatch switches to SW within one frame and logs once. The recorded VC4 reset hazard makes this mandatory.
15. **Deterministic mode** (`ZINC_DETERMINISTIC`): virtual clock, fixed dt, SW backend by default; GL allowed for compare tests only.

### 5.2 Frame budget arithmetic used above

* 60 Hz = 16.7 ms; 120 Hz = 8.3 ms; 30 fps = 33 ms. PS1 NTSC vblank = 16683 us (`hal_ps1.cpp`, `vbl_us`).
* Existing Pi 3B+ numbers: SW raster 70-85 ms on heavy frames, 25 ms at 4 threads; GL: 1.1 ms CPU, GPU-bound 15.5 ms for a whole-surface animation at 800x480 before the pacing fix. So 16.7 ms = about 10 ms GPU + 4 ms CPU + slack is a realistic T2 target at 800x480 and a stretch at 1080p (tile caching or half-resolution layers needed).
* SPI: see 4.11(e): 61 ms full frame at 40 MHz 1-bit SPI, 31 ms on the 10 MHz 8-bit i80 board; a typical UI change touches a few percent of the panel.

### 5.3 Profiling hooks

Per frame, always compiled (cheap counters), exported as a ring buffer and Chrome-trace JSON (extends ZN-046 and the existing `ZINC_PROFILE=1`, `ZINC_GL_STATS=1`, `ZINC_VISUALIZE`): `record_us, prepare_us, draw_us (CPU submit), gpu_us (EXT_disjoint_timer_query / Metal counters when present), present_wait_us, prims_by_kind, ranks, batches, draw_calls, break_reasons, vertices, upload_bytes, atlas_used/evicted, overdraw_ratio, damage_area_pct, scene_bytes, slots_written, allocs, dropped_prims`. Overlays: damage flashes (exists), batch colouring, overdraw heat map (GPUI ships `heat_map_color` in the shader, `shaders.wgsl:4`), atlas viewer, rank viewer.

---

## 6. Verification

### 6.1 Benchmarks to build (deterministic, scripted, one CSV schema, gated by ZN-148)

| ID | Scene | Measures |
|---|---|---|
| B1 | 10k flat quads, no overlap / 50% overlap | record, rank, batch, draw cost; draw calls; rank scaling |
| B2 | 2k rounded quads with borders and shadows | SDF cost per tier, split effectiveness |
| B3 | text wall 5k glyphs, 3 sizes, then scroll by slot | atlas hit rate, upload bytes, slot-only frames |
| B4 | hero Home / Kit / Forms / Gallery / Tasks (recorded Scenes) | real draw calls, overdraw, damage % |
| B5 | navigation map (POLY heavy) as `Mesh` vs `POLY` | tessellation cost, retained geometry win |
| B6 | scroll a 100k-row virtual list | layout cost, relayout boundary effectiveness |
| B7 | idle screen with a blinking caret | CPU idle cost (must stay near 0), damage rect size |
| B8 | 4 layers with opacity and rounded clips | offscreen cost, clip path coverage |
| B9 | image/video upload 720p at 30 fps | upload budget, `dyn` version path |
| B10 | feature matrix (one primitive of every kind and option) | cross-backend golden |
| B11 | T0 profile: ESP32 heap and band budget under the QEMU chip model (ZN-128, ZN-136) | RAM, SPI bytes/frame |
| B12 | PS1 fx raster in PCSX-Redux | cycles/frame, vblanks/frame vs current 1168 per 400 frames |
| B13 | WebGL1 vs WebGL2 JS renderer in headless Chrome | frame ms, extension fallbacks |
| B14 | `uniformMatrix4fv` x 10k from QuickJS | JS-to-native call rate for three.js |
| B15 | three.js scenes (cube, instanced, MRT, shadow map, glTF) | pass/fail + SSIM vs Chrome |

### 6.2 Golden pixel tests across backends

* The Scene dump format (4.2) makes goldens backend-independent: store `(scene, expected PNG per backend class)`.
* Classes: `sw-float` (the current goldens, unchanged), `sw-fx` (profile goldens, ZN-122), `gl` (llvmpipe, then Pi when a board is available), `web1`, `web2`, `console` (PCSX-Redux VRAM readback via its Lua API, already used for screenshots).
* **Comparator** (extends `scripts/pixel-diff.mjs`): metrics `max_abs`, `p99_abs`, `share_gt8`, and an **edge-mask** mode: the mask is computed from the Scene (1 px dilation of every primitive's bounds edge, rounded corners included); interior pixels must meet a tight bound, edge pixels a loose one. This separates "wrong colour/position" from "different anti-aliasing".
* Tolerance table (starting values from 4.17; each is a file next to the golden, never a global): interior <= 2 (GL vs SW), edge <= 24, `share_gt8` <= 1%; text integer-origin parity: max 3 (measured max 2-3); images at fractional origin excluded or shifted by the documented rule; SW float vs fx: edge <= 2 LSB.
* Frame hash for exact backends (`ZINC_FRAMEHASH`, ZN-125) stays for SW; GL uses the comparator.
* CI: SW and fx on every push; GL under Mesa llvmpipe EGL surfaceless in Docker (existing plan, ZN-116 AC1); WebGL1/2 in headless Chrome (SwiftShader) with forced context type; Pi nightly when hardware exists (ZN-055 parked); console in PCSX-Redux.
* Mutation check for the comparator itself: a golden with one rounded corner moved by 1 px must fail on interior and pass on edge-only noise.

### 6.3 Property and fuzz tests

* **Rank soundness**: random scenes (random rects, kinds, clips, alpha): SW render in painter order == SW render sorted by `(rank, kind)`, bit-identical. This validates the central batching theorem.
* **Range replay**: random edit sequences; `replay(range)` frames equal a fresh record.
* **Slots**: animating through slots == re-recording with the animated value.
* **Layout parity**: SoA layout boxes == old `ui.ts` boxes on every example and 10k random trees.
* **Backend contract fuzz**: random Scene to every backend must not crash, leak, or exceed `Caps` limits (limit-violation counters).
* **Context loss**: kill the GL context mid-frame; the next frames recover or fall back.

---

## 7. Roadmap (backlog-sized, each shippable, examples keep working)

Convention: S = 1 day, M = 2, L = 3. "Depends" lists existing tasks. Every task ends with all T1/T2 tests and existing goldens unchanged unless it says otherwise. New ids are placeholders (`R-x.y`). Milestone placement: a new milestone **"M11b Scene and backends"** between M11 and M12, or fold into M11.

### Stage 0 - Measure before building (no behaviour change)

* **R0.1 Scene dump and stats (M).** `ZINC_SCENE_DUMP=path` writes the frame's `Cmd` list + pools in a versioned binary; `zinc capture --scene`; `ZINC_RENDER_STATS` unifies `ZINC_PROFILE`, `ZINC_GL_STATS`, raster profile. *AC*: dumps of 6 hero/nav frames replay through the SW raster bit-identical to the live frame; stats print the 5.3 fields that exist today.
* **R0.2 Render benchmark corpus B1-B10 on the SW backend (M).** Depends R0.1, ZN-148. *AC*: CSV baselines committed; `tools/bench-render` runs in < 3 min; numbers for 1 and 4 threads recorded; regression gate wired to ZN-148.
* **R0.3 Comparator with edge mask and tolerance files (M).** Split out of ZN-113. *AC*: gl-check scenes compare with interior/edge metrics; the mutation check of 6.2 passes; ZN-113 reuses it.
* **R0.4 Offline order-rank study (S).** Tool that reads dumps, computes ranks and batch counts, no GPU. *AC*: report of draw calls vs painter-order batching for the 6 frames; decision recorded (spike S1).

### Stage 1 - Formalise the seam

* **R1.1 `include/zn/scene.h` and `Backend` interface (M).** Wrap existing SW raster and display-gl as backends; Scene v1 = `Cmd` (no field change). Depends ZN-104. *AC*: all T1/T2 tests unchanged; `renderer: cpu|gl|auto` still works; no frame-hash change.
* **R1.2 Tiers and caps in `capabilities.json` (S).** `gpu` becomes a value (`none|gles2|gles3|webgl1|webgl2|metal|vulkan|d3d`), add `tier`, `zinc doctor` prints probed caps; `requires` checks (ZN-123) understand them. *AC*: `zinc doctor` on macOS and in Docker llvmpipe prints a tier; programs with `requires gpu>=gles3` fail cleanly on esp32.
* **R1.3 ADR: GL floor (S).** Resolve D11/ZN-116 ("GL 3.3/GLES3") vs the implemented GLSL ES 1.00; one GLSL source with `ES2/ES3` macros. *AC*: decision doc; ZN-116 text amended.

### Stage 2 - Ordering and batching in shared code

* **R2.1 Rank tree (M).** Flat-array R-tree in C++ with scratch reuse and max-leaf shortcut; `assign_ranks(Scene&)`. *AC*: property test of 6.3 (10k random scenes bit-identical); 5k prims rank in < 0.5 ms on the Pi 3B+ (else the spike result says do not enable on T2).
* **R2.2 Batch planner (M).** Keys, feature flags, border/rim splitting moved out of `gl_renderer.cpp`; SW ignores it. *AC*: hero Home <= 40 draws (report); GL output unchanged within tolerance; ZN-117 unaffected.
* **R2.3 Hash-diff damage with LVGL joining (S).** `diff_rects` gains the join rule and a bounded list; compact `(hash, bounds)` previous-frame record. *AC*: frame hashes unchanged on all goldens; ESP32 profile RAM for the previous frame drops (measured).

### Stage 3 - Production GLES2/WebGL1 backend (T2)

* **R3.1 Direct replay + vertex-expanded VBO ring + index patterns (L).** Replaces render-to-texture + present pass; ring of 3. *AC*: hero Home/Kit/Forms within tolerance under llvmpipe; on the Pi, frame time p99 not worse than SW and CPU share <= 25% (existing acceptance).
* **R3.2 `LINE`/`POLY` (L).** Earcut-class triangulation (mapbox earcut.hpp is ISC **[memory]**; or libtess2) + the stroker already in `stroke_contours`, AA fringe, cache by payload hash. *AC*: hero Home and Gallery, canvas2d/svg examples within tolerance; no `LINE/POLY` skipped warnings.
* **R3.3 Atlas manager (M).** Bucket allocator, plots, eviction, A8 + RGBA pages, up to 4 pages, stats. Depends R3.1. *AC*: 200-glyph/size churn test; no mid-frame crash when the atlas fills; occupancy in stats.
* **R3.4 Capability gating + quirks + probe (M).** Caps from the driver, quirks table keyed on renderer string, boot probe vs SW. *AC*: forced-failure tests (`ZINC_GL_QUIRK`) fall back to SW with one log line.
* **R3.5 Optional instancing (S).** `EXT/ANGLE_instanced_arrays` path. *AC*: identical output; upload bytes drop reported.
* **R3.6 Render thread and 3-slot handoff (M).** (design doc phase 3). *AC*: `paint` overlaps raster; deterministic mode unaffected.
* **R3.7 Context loss and watchdog (S).** *AC*: kill-context test recovers; a 250 ms frame triggers SW fallback.

### Stage 4 - Web

* **R4.1 Scene wire format and JS renderer, WebGL1 + WebGL2 (L).** Depends R1.1, R3.x, ZN-135. *AC*: bouncing-ball and hero Home render in headless Chrome in `webgl` and `webgl2` modes within tolerance of SW; canvas-2D fallback still works.
* **R4.2 Web CI matrix (S).** SwiftShader, both contexts, size budget of the JS file (<= 40 KB). *AC*: green in CI.

### Stage 5 - UI engine cost

* **R5.1 SoA node storage + measure cache + relayout boundaries (L, two sessions).** *AC*: layout boxes identical to old on all examples (differential test); B6 scroll test faster; `measure()` allocation count 0.
* **R5.2 Range reuse for clean subtrees (M).** *AC*: property test 6.3; hero idle-with-caret frame re-records < 5% of nodes.
* **R5.3 Property slots for transform/opacity/scroll/colour lerp (M).** *AC*: slot frame == re-record frame; scrolling a long list records zero primitives per frame.
* **R5.4 Frame arena + `@frame` no-alloc lint (spike S first, then M).** *AC*: zero allocations over 600 frames in B4.
* **R5.5 Variable-height virtual list and token layer for the kit (M).** (gpui-kit lessons). *AC*: 100k-row list; theme switch without restyling components.

### Stage 6 - T0 and T1

* **R6.1 Compact scene + RGB565 native raster for ESP32 (M).** Depends ZN-128/136 models. *AC*: frame hashes of the s3-matrix and 2432s022 demos equal the oracle within the per-profile tolerance; RAM saving measured (target: UI RAM <= 16 KiB scene + 8 KiB band).
* **R6.2 Fixed-point raster template (L).** Depends ZN-120, ZN-121. *AC*: `ps1` profile goldens (ZN-122) pass; PS1 breakout vblanks per 400 frames improve over 1168 (recorded); no float instruction in the PS-EXE raster path.
* **R6.3 PS1 GP0 primitive backend (spike S, then L).** Depends ZN-156/157. *AC*: spike draws a rounded button, text and shadow with GP0 packets in PCSX-Redux and records packet counts; backend: breakout and a hero-lite screen match the fx SW frame within the console tolerance with VRAM readback.
* **R6.4 PS2 GS sprite backend (M, build-only until a BIOS exists).** Depends ZN-137. *AC*: builds in CI; screenshots from Play! or PCSX2 when available; SW fallback selectable.
* **R6.5 `AcceleratorUnit` hook (S, optional).** LVGL-style evaluate/dispatch for a 2D DMA unit on the SW backend.

### Stage 7 - T4 and quality

* **R7.1 Spike S6: native backend comparison (L, 3 days).** sokol_gfx vs Dawn vs ANGLE on the 6-primitive scene, Metal + D3D11 + GLES3. *AC*: decision doc with size, build complexity, shader workflow.
* **R7.2 Native backend (L).** *AC*: hero on macOS Metal within tolerance, GL path still available.
* **R7.3 Text quality tier (L).** Depends ZN-114, ZN-165, R3.3. *AC*: 4 subpixel variants opt-in with own goldens; `parity` mode bit-identical to before.
* **R7.4 Path renderer upgrade (L, research).** Loop-Blinn on T3, sparse-strip CPU coverage; decide after B5/B8 data.

### Stage 8 - Three.js and WebGL

* **R8.1 `zinc:webgl` API surface and conformance subset (L).** WebGL1/2 host objects over the GL backend, validation errors; a subset of the Khronos WebGL conformance tests under llvmpipe. Depends ZN-103, R3.x. *AC*: 100 selected conformance cases pass.
* **R8.2 Real three.js on `zinc:script` (L).** Depends R8.1, B14. *AC*: cube, instanced mesh, shadow map and glTF scenes render within SSIM tolerance of Chrome on T3; WebGL1-era three on T2 if an older release is chosen; call-rate and RAM numbers recorded.
* **R8.3 `Surface` primitive and 3D viewport in layouts (M).** *AC*: a `<three>` view scrolls and clips inside a `zinc:ui` page.
* **R8.4 `zinc:three` positioning (S).** Keep as the software subset, document differences, share `Mesh`. *AC*: ZN-107 unchanged and green.

### Existing tasks: replace, reorder, extend

| Existing | Action |
|---|---|
| ZN-116 GL path (M11, L) | **Replace** by R1.1, R1.3, R2.x, R3.1-R3.4; keep its two acceptance criteria (llvmpipe tolerance; frame time not worse) |
| ZN-113 pixel goldens (M10, L) | **Split**: comparator + tolerance files go first as R0.3; the golden set stays in M10 |
| ZN-104 display driver selection (In Progress) | Keep as prerequisite of R1.1 |
| ZN-117 mapping | Stay, after R3.1 (needs `Surface`/GL layers on the new interface) |
| ZN-114 text shaping, ZN-165 breaking | Keep; add the `TextLayout` interface and glyph key from 4.5/4.7; sequence after R3.3 |
| ZN-120, ZN-121 (fx profiles) | **Move earlier**, in front of ZN-156 and R6.2 |
| ZN-156 PS1 freestanding spike, ZN-157 ps1 target | Extend with the GP0 spike R6.3 |
| ZN-137 ps2 build gate | Extend with R6.4 |
| ZN-135 wasm without emscripten | Add R4.1 as the follow-up |
| ZN-107 3d/three plugins | Unchanged; R8.x is additive |
| ZN-105/106 canvas2d, svg, lottie | Unchanged; they benefit from R3.2 and `Mesh` |
| ZN-125 frame hash and capture contract | Extend: Scene dump and per-class goldens |
| ZN-164 host library split, size gates | Add render-backend size gates (no GL/tessellation/atlas in the T0 link) |
| ZN-148 benchmark gate | Wire R0.2 |

---

## 8. Risks and unknowns, each with a small spike (<= 2 days unless noted)

| # | Risk / unknown | Why | Spike | Pass/fail |
|---|---|---|---|---|
| S1 | Ranks do not reduce draw calls on real Zinc frames, or cost too much CPU on the Pi | GPUI publishes no numbers in the checkout; the uber shader may already batch well | R0.4 offline tool on the 6 dumps + Pi 3B+ timing of the C++ tree | draw calls <= 40% of kind-break batching; 5k prims < 0.5 ms |
| S2 | VC4 hangs on partial redraw/scissor (observed once, unexplained) | `gpu-renderer-design.md` Phase 1b hazard | stress: 10k frames of random partial changes with `timeout -s KILL` and reset counter on the Pi | zero resets; else keep full replay + idle skip |
| S3 | `EXT_instanced_arrays` / `OES_vertex_array_object` / derivatives on vc4 Mesa 25 | drives the T2 transport | `eglinfo`/`es2_info` dump on the Pi, stored in `tests/hw/` | per-extension list |
| S4 | Depth-buffer opaque culling helps or hurts on VC4 | tile GPU bandwidth | draw B2 with and without reverse opaque | frame ms and overdraw |
| S5 | Compact scene and RGB565 raster fit ESP32 (CPU and RAM) | 160 KiB heap, 240 MHz | B11 under the QEMU chip model; cycle counts on a board if one appears | scene+band <= 24 KiB; 30 fps on a 10%-damage UI |
| S6 | sokol vs Dawn vs ANGLE for T4 | size, tooling | R7.1 | decision |
| S7 | JS-to-native call rate of QuickJS-ng for WebGL | three.js issues thousands of calls per frame | B14 through `CallNative` (ZN-167/168) | >= 1M calls/s on desktop, >= 100k/s on Pi 3, else batch into a JS-side command buffer |
| S8 | RAM of real three.js in QuickJS-ng | module size, object churn | load three.module.js and render a cube, record RSS | < 64 MiB on desktop; define the minimum T2 RAM |
| S9 | Compile-time no-alloc enforcement in the AOT pipeline | depends on IR purity analysis | IR pass over `ui.ts` measure/paint, list allocation sites | site count; effort estimate |
| S10 | Layout rewrite changes pixels | parity is a hard requirement | differential test harness on current `ui.ts` first (no rewrite) | zero diffs on the 63 example entries |
| S11 | Gamma-space blending vs GPU defaults | ES2 has no sRGB framebuffer | render gradients + alpha text on GL vs SW | max diff <= tolerance |
| S12 | PS1 GP0 mapping fidelity for rounded UI | no AA, affine textures, 4 blend modes **[memory]** | R6.3 spike | visual review + packet counts; if unacceptable PS1 stays on the fx SW path |
| S13 | Fixed-point SDF accuracy and speed | Q20.12 range, no hardware divide | microbench in PCSX-Redux | edge error <= 2 LSB; < 8 ms for a 320x240 UI frame |
| S14 | WebGL1 availability in the field, Safari differences | decides how much to invest in web T2 | opt-in feature-detection telemetry in the JS renderer | decide whether WebGL1 stays |
| S15 | Subpixel text breaks pixel parity | goldens | render `parity` vs `high` text, count diffs | confirm default `parity` |
| S16 | Licences | WebRender MPL file-level copyleft, `gpui-kit-cpp` unlicensed, GPUI crates ship `LICENSE-APACHE`, Skia BSD-3 **[memory]**, sokol zlib **[memory]**, Dawn BSD-3 **[memory]** | read each `LICENSE` before vendoring (RULES.md vendoring rule) | list in `third_party/README.md` |
| S17 | Hit-region array diverges from `ui.ts` arbitration | many tested corner cases | run `tests/conformance/input*.tsx` with the array enabled in shadow mode | identical dispatch |
| S18 | Dual-source blending / LCD text not widely available | | caps probe only | feature stays opt-in |

Unknowns I could not resolve from the clones: GPUI's Metal renderer (extracted crate, absent); GPUI benchmark numbers; Skia `docs/` contents (the sparse tree only has `architecture/CPU.md` and a dot file); exact PS1/PS2/VideoCore/ESP32 hardware limits (taken from memory and repository docs, not re-verified); the three.js release in which WebGL1 was removed; Blend2D's availability on ARMv6/ESP32 (not evaluated); whether the board's i80 bus really moves one byte per WR cycle.

---

## 9. Glossary: GPUI to Zinc

| GPUI | Zinc (proposed unless marked existing) |
|---|---|
| `App`, `Context<T>`, `Entity<T>` | signals and stores of `zinc:signals` (existing); a Solid component state |
| `cx.notify()` / `observe` | signal write marks a node dirty / effect (existing mechanism, new dirty classes) |
| `Window` | `Surface` + display driver (existing `HalDisplay`) |
| `Render` / `RenderOnce` / `IntoElement` | component function returning JSX (existing) |
| `Element` (`request_layout`, `prepaint`, `paint`) | `UiNode` with `measure/arrange`, hit-region recording, `record` (paint) |
| `div().flex().rounded()...` fluent styles | `class` strings and `StyleSheet.create` Style records (existing, compile-time) |
| `Style`, `StyleRefinement` | `Style` record (existing) |
| `TaffyLayoutEngine` | Zinc flex layout, SoA + boundaries + measure cache (R5.1) |
| `Scene` | `Scene` (R1.1; v1 = `raster::Frame`) |
| `Quad`, `Shadow`, `Underline` | `Quad`, `Shadow`, decoration `Line` |
| `MonochromeSprite`, `SubpixelSprite`, `PolychromeSprite` | `GlyphRun`/`MaskSprite`, `LcdGlyph` (T4 opt-in), `Image`/`ColorSprite` |
| `Path` | `Path` (`LINE`/`POLY` today) |
| `Surface` (video) | `Surface` (video, camera, 3D, webgl canvas) |
| `DrawOrder` | `Rank` |
| `BoundsTree` | `RankTree` |
| `PrimitiveBatch` | `Batch` (planned by `Prepare`) |
| `push_layer` / `defer_draw` | `LayerPush` / `ui.openLayer` (existing, priority layers) |
| `PlatformAtlas`, `AtlasTile`, `AtlasTextureKind` | `Atlas`, `Tile`, `AtlasKind {A8, RGBA}` (R3.3) |
| `RenderGlyphParams` | `GlyphKey` |
| `LineLayoutCache` | `TextLayoutCache` |
| `Hitbox`, `HitboxBehavior` | `HitRegion`, `HitMode` |
| `DispatchTree`, `KeyContext`, `Action` | `ui.bindKeys`, `keyContext`, `ui.onAction` (existing) |
| `FocusHandle` | `ui.focusNode`, focus scopes (existing) |
| `rendered_frame` / `next_frame` | Scene slots (2-3 slots, R3.6) |
| `ElementArena` | frame arena (R5.4) |
| `AnyView::cached` | `<Cached>` / keyed subtree with range reuse (R5.2) |
| `Window::refresh` | `invalidateAll` (drops range reuse and atlas stamps) |
| `on_next_frame`, `request_animation_frame` | `ui.requestFrame`, engine animations writing slots (R5.3) |
| `PlatformWindow::draw` | `Backend::draw` + `present` |
| `gpui_wgpu`, Metal renderer | `Gles3Backend` / JS web renderer, `NativeBackend` |
| `gpui_component::Root`, `Theme`, tokens | `zinc:ui/kit` root, `SemanticTokens` (R5.5) |
| `VirtualList`, `uniform_list` | `ui` virtual list (existing fixed height; variable in R5.5) |
| `gpui_shell` (JS extensions) | `zinc:script` (existing, ZN-103) |

---

## Appendix: where each claim lives (clone index)

* GPUI core: `zed/crates/gpui/src/{scene.rs, bounds_tree.rs, element.rs, window.rs, view.rs, taffy.rs, text_system.rs, text_system/line_layout.rs, platform.rs, arena.rs, key_dispatch.rs, app/context.rs, _ownership_and_data_flow.rs}`; renderer: `zed/crates/gpui_wgpu/src/{wgpu_renderer.rs, wgpu_atlas.rs, shaders.wgsl, shaders_webgl.wgsl, shaders_storage.wgsl, cosmic_text_system.rs}`; macOS: `zed/crates/gpui_macos/src/display_link.rs`.
* gpui-kit: `gpui-component/{README.md, crates/base/README.md, crates/base/src/{virtual_list.rs, theme_tokens.rs, motion/}, crates/shell/README.md}`; C++ port: `gpui-kit-cpp/{README.md, info-scene-graph.md}`.
* Skia: `skia/src/gpu/graphite/{DrawOrder.h, DrawList.h, geom/BoundsManager.h, render/, sparse_strips/}`, `skia/src/gpu/ganesh/{ops/GrOp.h, ops/OpsTask.cpp, GrDrawOpAtlas.h, gl/GrGLCaps.cpp}`.
* react-native-skia: `react-native-skia/packages/skia/src/sksg/{Reconciler.ts, Container.native.ts, Recorder/Core.ts, Recorder/Recorder.ts}`, `cpp/api/recorder/{RNRecorder.h, JsiRecorder.h}`, `cpp/rnskia/RNSkManager.cpp`, `README.md:37-41`.
* react-native-webgpu: `react-native-webgpu/packages/webgpu/{cpp/rnwgpu/RNWebGPUManager.cpp, cpp/rnwgpu/api/, cpp/jsi/JSIConverter.h, CONTRIBUTING.md}`.
* Impeller: `impeller/engine/src/flutter/impeller/{README.md, entity/draw_order_resolver.h, entity/contents/uber_sdf_contents.h, entity/contents/uber_sdf_parameters.h, renderer/backend/gles/{capabilities_gles.cc, buffer_bindings_gles.cc, blit_command_gles.cc}}`.
* WebRender: `webrender/webrender/src/{batch.rs, picture.rs, gpu_cache.rs}`, `webrender/swgl/README.md`.
* Vello: `vello/{ARCHITECTURE.md, vello_common/src/tile.rs, vello_gpu/src/schedule/mod.rs, vello_gpu/src/render/webgl/}`; Pathfinder: `pathfinder/README.md`.
* ImGui: `imgui/{imgui.h, imgui_draw.cpp, backends/}`. LVGL: `lvgl/src/{core/lv_refr.c, draw/lv_draw.c, draw/lv_draw_private.h, display/lv_display_private.h}`, `lvgl/lv_conf_template.h`. sokol: `sokol/sokol_gfx.h`. bgfx: `bgfx/{include/bgfx/defines.h, src/bgfx_p.h, src/config.h}`. raylib: `raylib/src/rlgl.h`. three.js: `three/src/renderers/{WebGLRenderer.js, webgl/*, webgpu/WebGPURenderer.js}`.
* Zinc: `docs/reports/{gpu-renderer-design.md, render-perf-options.md}`, `docs/ui.md`, `docs/targets/playstation.md`, `runtime/{gfx.cpp, raster.cpp, zrt_raster.h, include/render_bands.h}`, `plugins/{display-gl, display-st7789, 3d, three}`, `targets/{capabilities.json, ps1, ps2, wasm, esp32}`, `compiler/src/cli.ts:34-44`, `next/ARCHITECTURE.md`, `next/backlog/tasks`, `docs/reports/zinc-next-decisions.md:73-81`.