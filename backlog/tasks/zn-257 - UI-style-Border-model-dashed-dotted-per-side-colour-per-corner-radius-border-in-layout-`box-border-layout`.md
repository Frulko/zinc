---
id: ZN-257
title: >-
  UI style: Border model: dashed/dotted, per-side colour, per-corner radius,
  border in layout (`box-border-layout`)
status: Review
assignee:
  - '@parallel'
created_date: '2026-10-07 12:56'
updated_date: '2026-11-09 08:10'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-174
ordinal: 13200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-11-07):** Left: GL-tier compare of extended borders, `box-border-layout`, esp32 degrade line.

From docs/reports/ui-style-system.md (section 6, ST-08). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Goldens: dashed, dotted, four colours, four radii, on SW f32 and GL within tier tolerance.
- [x] #2 esp32 profile: dashed becomes solid and radii the largest corner, with one log line (test).
- [x] #3 Presets `border`, `border-2`, `rounded-*` bit-exact with the old path.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
usage: n/a. border-dashed / dotted / solid, border-t|r|b|l|x|y-<colour> (a colour per side), rounded-t|r|b|l|tl|tr|br|bl[-size] (a radius per corner; the background of such a box is a polygon with arcs). The extended border is drawn by paintBorderExt: the centre line of the border as four side polylines from the middle of one corner arc to the middle of the next, each stroked with its own colour and width, dash pattern (dashed: 3w on, 2w off; dotted: w on, w off) along it. The plain border, rounded-* and border-N presets keep the old drawing (border()/rrect()): AC3 holds, all earlier scene hashes and the 4-entry canary unchanged. rounded-x-lg and other malformed radii are now refused (a NaN radius used to be accepted). Tests: scene border-ext checked on the image (dashed, dotted with radius, four colours, tl+br, top corners, dashed with two corners), token fields in tests/golden/ui-tokens, the JSX grammar kept equal. NOT done: AC1 (the GL tier tolerance: the GL display is not in this tree yet) and AC2 (esp32 degradation with a log line belongs to ZN-278, style capability levels); border in layout (box-border-layout); dashed borders ignore their corners' arcs only at the side joins (each side restarts its dash).
Review 2026-10-25: kept open. (review-close proposed, corrected by the verifier) Nothing compares the extended borders on the GL tier: tests/t1/style_border.sh and tests/golden/ui-style/border-ext.hash are software framehashes only, so 'covered by the tier checks' is unsupported. `box-border-layout` from the title is also not implemented (no match in lib/std). Evidence: tests/golden/style-border, tests/t1/style_border.sh, tests/golden/ui-style/border-ext.tsx
Review 2026-11-07: done-partly. Dashed/dotted, colour per side and radius per corner are in lib/std/ui.ts and tests/t1/style_border.sh; left: GL golden and `box-border-layout`. Evidence: lib/std/ui.ts:432; tests/t1/style_border.sh; tests/golden/ui-style/border-ext.hash
2026-11-09 (worktree agent): done but the GL compare, which opens a window (the owner's milestone): status Review.
- AC2: on tier T0 (esp32) paint() draws a dashed or dotted border solid (solidOnTier; outline-dashed/dotted too) and a box with a radius per corner with its largest corner for the background, the border, shadows and rings (largestCorner); one tierWarn line each (bits 64, 128). Build (D245): styleTokenTier rows needing T1 for `border|outline-dashed|dotted` and `rounded-(t|r|b|l|tl|tr|br|bl)[-..]`, in the run-time lines' words; tests/t0/style_level.sh checks them. Test: tests/t0/style_border_esp32.sh (on esp32 a dashed box with three corner radii draws the frame of the solid box with the largest radius, a dotted box with side colours the frame of the solid one; one line each; on the desktop both differ). Other profiles take the old path unchanged: border-ext 6d760899c7638e86 (interpreter, --native AOT, QuickJS), style-border dbc3d290aa72369f, ring 2d5cc6038a62d0bb.
- `box-border-layout`: covered by ZN-882 (commit 78c2d81a2, 2026-10-30): borders take layout space by default as in CSS and Yoga (inT/inR/inB/inL), with `box-border`/`box-content` (ZN-381). Decision: no opt-in `box-border-layout` token; it is not a Tailwind class and the switch it stood for is now the default.
- AC1: the SW golden is tests/golden/ui-style/border-ext (dashed, dotted, four colours, four radii); ui_style_gl.sh compares it with the GL replay. Not run (windowed): `UI_STYLE_GL_ONLY=border-ext tests/t1/ui_style_gl.sh`.
- Research (sonnet sub-agent): WebRender fits dashes per side with a half dash at each end (compute_half_dash https://doc.servo.org/webrender/border/fn.compute_half_dash.html , cs_border_segment.glsl https://arai.searchfox.org/firefox-main/source/gfx/wr/webrender/res/cs_border_segment.glsl ); Mozilla's proposal https://bugzilla.mozilla.org/show_bug.cgi?id=652650 ; Gecko's CPU path https://arai.searchfox.org/firefox-main/source/layout/painting/nsCSSRenderingBorders.cpp . Fitting the dash count per side (n = round(L / (dash + gap)), pattern scaled) would fix the restarts at the side joins: a later.md line.
- Proposed tests: `UI_STYLE_GL_ONLY=border-ext tests/t1/ui_style_gl.sh` (the extended borders on GL within 5 % / 3; ~10 s, windowed); `tests/t1/style_border.sh` (objects and classes frames unchanged; ~10 s); `tools/proto-capture compare` (defaults unchanged; minutes).
<!-- SECTION:NOTES:END -->
