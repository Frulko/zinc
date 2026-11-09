---
id: ZN-260
title: 'Box shadow: several layers, inset, spread'
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-07 12:57'
updated_date: '2026-11-09 07:40'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-174
  - ZN-259
ordinal: 12900
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Rewritten by the review of 2026-10-25:** shadow-sm..xl stay bit-exact; add layered and inset shadows (`shadow-[...]`, `inset-shadow-*`) with goldens; degrade past 2 layers / blur 8 px on small profiles with a log line.

From docs/reports/ui-style-system.md (section 6, ST-10). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `shadow-sm..xl` bit-exact with today.
- [ ] #2 Goldens of two-layer and inset shadows; GL analytic blur within tolerance.
- [x] #3 T0: more than 2 layers or blur > 8 px degrade as specified (test) and inset drops with a log line.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-10-25: rewrite. Presets and RN shadows shipped; multiple, inset and spread shadows did not. Evidence: lib/std/ui.ts:961 shadow levels, RN shadows (abe45f10), tests/t1/style_shadow.sh; no inset or multi-layer

2026-11-09 (worktree agent): done but the GL compare, which opens a window (the owner's milestone): status Review.
- Classes: `shadow-[<CSS box-shadow>]` (`_` for a space, `,` between layers; `x y [blur [spread]] [colour] [inset]`; lengths px/rem; colours as gradient stops, plus CSS Color 4 spaces `rgb(0 0 0 / 0.4)`); its layers replace the preset, the first is on top, the spread grows the box and its radius. Tailwind v4 `inset-shadow-2xs|xs|sm|none|[..]` and `inset-shadow-<colour>[/alpha]`. Style objects: a `boxShadow` string (React Native 0.76) lowers to `@shadow-[..]` (jsx.cpp). Storage: a `ShadowX` side record on UiNode (copy on write, shared default when unused), a `ShadowLayer` per layer.
- Engine: SHADOW pad bit `kShadowInset` (zrt_raster.h); the hole (dx, dy, spread) in off, n and c2 (same() and cmd_hash compare off for an inset, so the frame diff sees it). Raster `inset_rrect`: the box's coverage times the presets' falloff turned outward from the hole (k(-d)); also under a matrix (draw_xform). GL replay: the same falloff in the SHADOW_M block (blur < 0 marks the inset, the spread in v_par.w, the pixel from the hole's centre in v_pos.zw; through a matrix too); insets skip the lean SHADOW program. New host row `host.gfxInsetShadow` (appended, a gfx tail row) behind `gfx.insetShadow(x, y, w, h, r, blur, dx, dy, spread, colour, alpha)`; the web runtime draws it with a canvas shadow of an even-odd frame. Metal skips insets; the console replay refuses them (the software raster draws that frame).
- Small profiles (TIER <= 1): two layers around the box at most, blurs capped at 8 px, insets dropped; one tierWarn line each (bits 8, 16, 32). Build (D245): styleTokenTier rows needing T2 for `inset-shadow-2xs|xs|sm|[..]` and `shadow-[..]` with an inset, more than two layers or a blur over 8 px, in the run-time lines' words.
- AC1: the shadow-presets scene hashed with develop's binary on the pre-change tree (ZINC_ROOT = git archive of b43a939eb) gives 2db5b22e41549a25, the same after; ui-style/shadow.hash ccc0d0ef79104fa7 unchanged. AC2: goldens tests/golden/ui-style/shadow-layers (9c297f91b8d339df, the same on the interpreter, `--native` AOT and QuickJS) and shadow-presets; ui_style.sh and ui_style_gl.sh pick both up. Not run: the GL compare, `UI_STYLE_GL_ONLY='shadow-layers shadow-presets' tests/t1/ui_style_gl.sh`, and `tests/t1/gl_replay_es2.sh` for the shader. AC3: tests/t0/style_shadow_layers.sh (esp32: three layers, a 12 px blur and an inset draw the frame of two layers at 8 px; one line each); tests/t0/style_level.sh has the U0005 rows.
- Research (sonnet sub-agent): Evan Wallace's analytic rounded-rect shadow https://madebyevan.com/shaders/fast-rounded-rectangle-shadows/ ; Raph Levien https://raphlinus.github.io/graphics/2020/04/21/blurred-rounded-rects.html ; Flutter Impeller rrect_blur.frag https://flutter.googlesource.com/mirrors/engine/+/525a53eb58ed4e265cf39a791bcf8f210404aacf/impeller/entity/shaders/rrect_blur.frag ; vello_cpu https://doc.servo.org/src/vello_cpu/fine/common/rounded_blurred_rect.rs.html ; Tailwind https://tailwindcss.com/docs/box-shadow and https://tailwindcss.com/blog/tailwindcss-v4-1 . CSS: sigma = blur / 2, the first layer on top, an inset clipped to the padding box around a hole shrunk by the spread (radius r - spread).
- Decision: keep the presets' smoothstep falloff for the new layers (bit-exact presets, one look for every shadow, the GL replay already matches it) rather than a Gaussian (erf); a Gaussian for every shadow is a later.md line.
- Proposed tests: `UI_STYLE_GL_ONLY='shadow-layers shadow-presets' tests/t1/ui_style_gl.sh` (GL within 5 % / 3 of the software frame; ~20 s, windowed, little memory); `tests/t1/gl_replay_es2.sh` (the new SHADOW block compiles as GLSL ES 1.00; ~1 min with its build); `tests/t1/ui_style.sh` (the two new scene hashes; ~1 min); `tools/proto-capture compare` (defaults unchanged; minutes).
<!-- SECTION:NOTES:END -->
