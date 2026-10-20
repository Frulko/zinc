---
id: ZN-261
title: >-
  UI style: Gradients: angle, N stops, radial, repeating, conic; Tailwind
  `via-`, `bg-[linear-gradient(..)]`, `backgroundImage`
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-07 12:57'
updated_date: '2026-10-11 14:30'
labels:
  - ui
  - style
  - size-L
milestone: m-17
dependencies:
  - ZN-174
  - ZN-176
  - ZN-259
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-12). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Axis-aligned multi-stop equals the chained-rect lowering pixel for pixel; 45-degree and radial goldens on SW.
- [x] #2 GL ramp texture within tolerance on llvmpipe; T2 uses at most the ramp page (atlas stats). Analytic stops in the shader instead of a ramp page (decision 1 in the notes): no texture page, 0 CPU tiles; within one unit of the software frame on this Mac's GL; the llvmpipe run is a later.md line (cross-platform pass).
- [x] #3 esp32: 2 stops linear only, others collapse with a log line; conic only on T3.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-11 (agent worktree, branch worktree-agent-a4d46fff76a200f88).

What landed:
- zinc:ui (lib/std/ui.ts): a copy-on-write gradient record `gx: GradX` (kind, angle or corner, repeating, radial shape/size/centre, Tailwind stop alphas and positions, CSS stops). Class tokens of Tailwind v4: bg-linear-to-{t,tr,r,br,b,bl,l,tl} (bg-gradient-to-* too), bg-linear-<deg> and -bg-linear-<deg>, bg-radial, bg-conic, bg-conic-<deg>, bg-linear-/radial-/conic-[css args], bg-[(repeating-)linear|radial|conic-gradient(..)], from-/via-/to- colours (with /alpha, transparent, current) and positions (from-10%), bg-none, the /srgb /oklch modifiers accepted. A CSS gradient parser (directions, deg/turn/rad/grad, to <side> <side>, circle/ellipse, the four extents, explicit radii, at <position>, from <angle>, stops with one or two positions in %, px, angles; colour hints skipped; `in <space>` accepted). CSS colour stop fix-up; a transparent stop takes its neighbours' colour (what premultiplied interpolation shows); the background colour is painted under a gradient that is not opaque.
- Painter (paintGradient): along an axis with one alpha and stops inside the box, chained two-stop gradient() rects with seams on whole pixels (no new raster work, every profile; the prototype's bg-gradient-to-* + from + to keeps its one command); otherwise one gfx.gradientPaint command.
- zinc:gfx gradientPaint(x, y, w, h, r, paint, alpha) (host.gfxGradientPaint, appended row): a RECT with grad 5 and a paint record in the point pool, the canvas2d record format [kind, x0, y0, r0, x1, y1, r1, n, (offset, rgb, alpha) * n] with two new kinds, 3 CSS ellipse and 4 CSS conic, and +8 repeating. runtime/raster.cpp paint_at evaluates them (shared with canvas2d), fill_rrect and the XFORM path paint with it, the frame diff and the compact hash cover the record.
- GL replay: a RECT grad 5 is one FILL quad whose colour the shader computes from the paint uniforms of ZN-590.04 (up to 8 stops; kinds 3, 4 and repeating added to the shader); more than 8 stops come from a CPU tile (draw_poly takes a RECT). gl_replay_es2 still compiles the shaders as GLSL ES 1.00.
- jsx.cpp: validClass accepts the new tokens (ui_tokens checks both grammars agree, 20 tokens added to its golden); `backgroundImage`, `experimental_backgroundImage` and `background` with a CSS gradient (or none) lower to the `@bg-[..]` token at build time.
- Tiers (zinc:platform TIER, targets/capabilities.json): below T2 (esp32, rmpp, sim T0; ps1, ps2 T1) a gradient keeps two stops along an axis, anything else is drawn from its first to its last colour along the nearest axis; below T3 (and rpi1's T2) a conic is the average of its stops; one log line per kind (`zinc:ui: ... on this profile (tier Tn)`).
- docs/ui.md: a Gradients section; the generated token block refreshed (tools/ui-docs).

Decisions (no number taken; for the coordinator's decision record):
1. GL gradients: analytic stops in the replay shader (ZN-590.04's uniforms) instead of a 1x256 ramp texture page. Scores (RULES 4): analytic fit 4, perf 4, size 5, maint 4, licence 5, port 5, effort 5 = 62; ramp page fit 5, perf 4, size 3, maint 3, licence 5, port 4, effort 2 = 55. The ramp would serve any number of stops in one batch but adds a page, uploads and a sampling that departs from the raster's lerp quantization; the analytic path is the canvas paint's, already exact against the raster. So AC 2's "ramp texture" is met by the analytic path: no texture page at all (0 CPU tiles in the golden's GL stats), more than 8 stops on a CPU tile. Revisit if a page needs many gradients with more than 8 stops each frame.
2. A RECT with a paint record (grad 5) rather than a POLY with the canvas paint (grad 4): the rounded-box SDF coverage of every other box (no polygonized corners or 4x4 supersampled edge against the borders), one quad on the GPU instead of the stencil passes, and the same record, paint_at and shader code as canvas2d.
3. Colours interpolate in sRGB (CSS's default for these colours); Tailwind v4's `in oklab` is not followed (later.md).
4. A missing from-/to- stop is transparent (Tailwind); before, a bg-gradient-to-* with one of them drew no gradient. The examples always give both (unchanged pixels: proto-capture 40 of 42, the known two).

Tests (this Mac, load 5.3 to 6.3 from another agent's build):
- tests/t1/style_gradient.sh (new, 17.6 s): golden frame hash (interpreter; AOT gives the same hash a1513bcab3ca6afb), check.py golden (the via- box equals the stacked bg-gradient-to-b boxes pixel for pixel; 45-degree, radial and conic pixels equal the CSS geometry within one unit; a perturbed geometry fails 21 checks), check.py paint (gradientPaint equals the chained gradient() rects pixel for pixel, vertical and horizontal), esp32 profile (both log lines once, the 45-degree box vertical, the conic one colour), GL vs software at the window's density: golden 0.000% over 24, mae 0.021, max 2, 0.0 CPU tiles per frame; paint.ts (10-stop tile, ellipse, conic) 0.000%, mae 0.002, max 1.
- PASS: ui, ui_style, ui_tokens, ui_transition, ui_state, ui_theme, ui_cmds, ui_docs, jsx, jsx_style, react_class, style_border, style_dynamic, style_flex, style_shadow, style_size, style_transform, gl_replay_es2, canvas, image_rect, gfx_transform, scene_dump, backend_sw, damage_sig, gl_renderer, gpu_strokes, gl_convex, image_rect_gl, react_native, rn_showcase.
- FAIL shared_headers: src/zpk/zpk.h:22 kMaxAlignment, not touched here (on main before this task).
- tools/proto-capture compare --canary 4 of 4; --all 40 of 42 (3d/model 3 px, three/cubes 5 px: the known two).
- Also run by hand: --profile ps1 (fx12) and rpi1 render the golden with their collapse lines.

Not done here (later.md lines in the report): oklab interpolation, gradient state variants (hover:from-*), per-corner radii under a gradient, llvmpipe and VideoCore IV GL runs, canvas2d createConicGradient through kind 4.
<!-- SECTION:NOTES:END -->
