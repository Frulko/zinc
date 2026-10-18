# Faster rendering on weak GPUs: ideas from the first zbench tables (2026-10-18)

Research and ideas only: nothing here is implemented. Tags: `[measured]` a zbench number (docs/reports/bench/zbench-render-*.json), `[code]` read in this tree, `[web]` a source read through search results or one fetched page, `[idea]` my reasoning, not checked.
The goal stated by the owner: 1080p on the Raspberry Pi 3, a faster GPU path than software on the Tegra 3, per-platform limits (shadows, animations), cheaper shaders, PS1-style approximation, and many small gains that add up.

## What the tables say (first run, corrected surface size)

- Tegra 3 (Nexus 7, 1280x704): opaque fill 8 screens = 7.2 Mpixel per frame at 32 fps = about 230 Mpixel/s in GL; the software raster does the same scene at 33 fps with 28 ms of CPU `[measured]`. The software raster skips what is covered, the GL path (no occlusion on a scene of 8 commands) shades all of it `[code]`.
- Tegra 3 is an immediate-mode GPU: hidden fragments are shaded, so overdraw is paid in time and bandwidth `[web: NVIDIA Tegra GLES2 guide, https://archive.docs.nvidia.com/gameworks/content/technologies/mobile/gles2_perf_main.htm ; https://www.tomshardware.com/uk/reviews/tegra-4-tegra-4i-gpu-architecture,3445-2.html]`.
- Pi 3 (VideoCore IV): 8 opaque screens at 1080p run at 60 fps (the occlusion pass drops the covered ones), 8 translucent screens run at 8 fps = about 130 Mpixel/s of blending `[measured]`. Blending on VC4 is code in the fragment shader (state-dependent shader variants) `[web: Mesa vc4 notes]`, so a translucent pixel costs far more than an opaque one.
- Pi 3: rounded_shadow takes seconds a frame, ui_anim_transform 1.8 s, gradients and clip_nested 5 fps, while the CPU does under 1 ms `[measured]`. The shadow shader is analytic and short (`gl_replay_shaders.h`: one signed distance, one smoothstep) `[code]`, so the cost is not the arithmetic of one pixel. 601 draw calls a frame, programs switched between modes (shadow / fill alternating), translucent quads larger than the visible shadow `[measured, code]`.
- 720p drawn and scaled to 1080p by the GPU halves the Pi's frame rate (30 instead of 60) `[measured]`.

## 1. Can the Tegra 3's GPU beat the software raster?

Probably yes for the scenes that are not fill-bound, no for full-screen layers, unless the fill is cut:

1. Cut the pixels shaded: occlusion/culling already exists (ZN-412.01) but only starts at 64 commands or a rectangle over half the screen `[code]`; on an immediate-mode GPU even small opaque covers pay. Test with a differential scene (N stacked opaque rectangles) with and without the pass `[idea]`.
2. Cut the cost per pixel: one program per mode already (`fs_source`), so no ladder of ifs; check the precision qualifiers actually used (mediump where the output is 8-bit colour) `[idea]`. I found no source on Tegra 3 fp20/highp behaviour: unverified.
3. Do not use the GPU where software wins: a table `gl_family -> default renderer`, filled from the zbench rows, per GPU. The engine already knows the family (`gl_family` in the profile) `[code]`. The software raster is already the default on Android (D126) `[code]`.
4. Layers: keep static layers as textures and re-blend only what moves (the damage-small scene shows damage tracking works: 41 fps against 24 for a full redraw on the Nexus) `[measured]`.

## 2. The Raspberry Pi 3 at 1080p

- Let the display hardware scale, not the GPU. The HVS (hardware video scaler) scans out planes and scales them; DRM atomic planes expose scaling, a magnification filter (PPF) included `[web: kernel vc4 docs https://docs.kernel.org/5.4/gpu/vc4.html ; Anholt, XDC 2017 https://wiki.freedesktop.org/xorg/Events/XDC2017/anholt_vc4_vc5.pdf]`. Today a program that names a smaller size than the KMS mode is scaled by the GPU `[code: docs/plugins/display-gl.md]`. Rendering 1280x720 into a GBM buffer and putting it on a plane (`drmModeSetPlane` / atomic) scaled to 1920x1080 would remove the 30 fps cap at no GPU cost. Not confirmed on a Pi 3 by a source: needs a test on the device `[idea]`. A mode change from a second client has been reported to crash a Pi 4 `[web, weak source]`: keep the mode set by the one owner of the display.
- Use Mesa's own diagnosis first: `VC4_DEBUG=perf` lists the known causes of slow paths; `glClear` of colour and depth avoids loading old tiles; `glScissor` on every draw lets untouched 64x64 tiles skip load/store; non-constant array indexing in shaders is an IF ladder and "very expensive" `[web: https://docs.mesa3d.org/drivers/vc4.html]`. Our scenes use the damage rectangle as the scissor already for small damage `[code]`; check that the occlusion/clear path really issues a clear of both buffers.
- Blending is the expensive operation. Rules that follow: draw opaque where the design allows it (a card background, a shadow that is only a tinted border), avoid full-screen translucent layers, make a shadow quad no bigger than the visible blur (today the quad is the box plus the blur on each side plus 1, all drawn translucent) `[code]`.
- Shadows, three precedents: the closed-form blurred rectangle (product of two 1D blurs, polynomial erf) used by Chromium/Skia on the GPU and by VLC `[web: https://madebyevan.com/shaders/fast-rounded-rectangle-shadows/ ; https://code.videolan.org/videolan/vlc/-/merge_requests/7198]`; a cached 9-slice or corner texture when the radius is much smaller than the blur (KDE Breeze drops the corner term for that reason) `[web: https://invent.kde.org/plasma/breeze/-/merge_requests/118]`; a few triangles that follow the shadow's outline instead of a full quad `[web: imgui #1329 discussion]`. For us, a 9-slice texture of the shadow, cached per (blur, radius), drawn as 9 textured quads (or 1 stretched quad), has no per-pixel maths and no recomputation `[idea]`.
- Measure before guessing: a scene with N shadows (N = 10, 30, 60, 120) tells whether the cost is per draw call, per pixel or per program switch; the seconds a frame suggest a synchronisation per command, not arithmetic `[idea]`.
- Existing work found: Weston's old Pi backend put surfaces on DispmanX elements (hardware overlays) and kept GLES for what needed a transform `[web: Weston rpi commits]` — the same split (planes for static layers, GL for the moving ones) is the model for the Pi; I found no open-source UI toolkit benchmark of VC4 at 1080p.

## 3. Per-platform quality tiers (what a PS1 would do)

A tier table chosen by GPU family and measured budget, set in one place, never in the app:

| Tier | Shadows | Gradients | Transform/opacity animation | Colour |
|---|---|---|---|---|
| high (desktop, iPad) | analytic blur | per-pixel | all | 8888 |
| mid (Tegra 3, Adreno 220) | 9-slice texture | 2-4 stops, banded | only the visible part, one layer | 8888 or 565 |
| low (VC4 at 1080p) | hard-edged offset rectangle, or none while moving | 2-colour, precomputed ramp texture | transform only, no opacity fade (opacity forces a blended pass) | 565 with dither |

PS1-style approximations that map onto our renderer `[idea]`:
- Shadows: during a scroll or an animation use the cheap form, restore the exact one when idle (the user does not see the difference in motion).
- Gradients: precompute a 1D ramp texture (256 texels) per gradient and sample it; the iPad's software raster spends 136 ms on a gradient frame, a ramp lookup per pixel or an incremental per-row step is far cheaper.
- Colour depth: a 16-bit framebuffer halves the bandwidth on VC4 and Tegra 3 (both are bandwidth-limited at 1080p / 1280x800) `[web: NVIDIA guide: bandwidth grows with the display]`; a 4x4 ordered dither hides the banding, as on the PS1.
- Resolution: draw the heavy layer at half size and scale it (blurs and shadows are low-frequency: a half-resolution blur is almost invisible), draw text and borders at full size.
- Cap work, not frames: stop an animation's secondary effects when the frame time budget is exceeded (the engine measures its frame time: the budget feed exists, the profiler).

## 4. Small gains that add up (a list to work down, each measured with zbench)

1. Occlusion threshold and covered-command culling for small lists (Tegra 3).
2. Shadow quad sized to the visible blur; 9-slice cache.
3. Group draws by program (fewer switches) where the paint order allows it; count switches in the profile (`gl_programs_switched`, to add).
4. One clear of colour + depth per frame; scissor to the damage on every draw (VC4 tiles).
5. Gradient ramp textures; no per-pixel branching in the shader.
6. 16-bit target + dither on the low tier.
7. HVS plane scaling for 720p->1080p on the Pi; static layers on planes.
8. Texture uploads: only the changed region (`image_upload_only`: 11-16 ms on the Nexus in GL).
9. Renderer choice per GPU family (software on Tegra 3 until the GL path wins).
10. Keep every measurement in the same artifact: `zbench gate` fails a change that is slower than the noise allows, so each gain stays.

## 5. What I could not establish

- Why the Pi spends seconds on a shadow frame: no GPU timer on VC4 (`gl_timer_source: none`), no profile of the GPU. `VC4_DEBUG=perf` on the device and `v3d_regs` are the next tools `[web: Mesa vc4 page]`.
- Tegra 3 precision and fill-rate figures: the NVIDIA page gives clocks (520 MHz GPU) and general advice, no pixel rate.
- Whether the HVS can scale a 1280x720 buffer to 1080p on this Pi 3 without a visible filter cost: needs the test above.
