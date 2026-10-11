---
id: ZN-262
title: >-
  UI style: Background images and `<image>` fit: `object-fit/position`,
  `bg-size`, `bg-repeat`, tint
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-07 12:57'
updated_date: '2026-10-11 12:45'
labels:
  - ui
  - style
  - size-M
milestone: m-17
dependencies:
  - ZN-251
ordinal: 47000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From docs/reports/ui-style-system.md (section 6, ST-13). The audit and the design are in that report. Additive only: defaults and all examples/* stay pixel-identical (tools/proto-capture compare). lib/std/ui.ts is shared with the prototype and holds another developer's uncommitted StyleSheet work: land it first, then change the file with a hunk-only commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `cover`, `contain`, `fill`, `none` goldens with a 2:1 image in a 1:1 box.
- [x] #2 Repeat respects the command budget (16 tiles on esp32, test).
- [x] #3 Tint multiplies on SW and GL within tolerance.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done 2026-10-11 (agent worktree, branch worktree-agent-abcc5496f939ad6ac).

What landed:
- lib/std/ui.ts: a cold side record ImgX (copy on write, ownIm(), reset with the others) holds object-fit / object-position, the tint, and the background image with its size, position and repeat. Class tokens with Tailwind v4's names: object-fill|contain|cover|none|scale-down, object-<side/corner>, object-[..]; bg-[url(..)], bg-auto|cover|contain, bg-size-[..], bg-<side/corner>, bg-position-[..], bg-repeat|no-repeat|repeat-x|repeat-y|repeat-space|repeat-round; tint-<colour> (twrnc's name: Tailwind has no tint utility). PROP ids 113 objectFit, 114 tintColor. bg-none also drops the image.
- Painting: one drawTiles() for both: a tile is one gfx.drawImageRect of the part of the image inside the box (no clip unless the box is rounded), tile edges on whole pixels (no seams), tint through drawImageRect's multiply (ZN-581). An <image> without ImgX keeps the prototype's one drawImage command, as does a fit that lands exactly on the box with no tint. A background image is painted over the background colour and under a gradient.
- next/src/frontend/jsx.cpp: validClass knows the tokens; style objects lower backgroundImage url(..), backgroundSize, backgroundPosition, backgroundRepeat, objectPosition to the same tokens at build time; objectFit and React Native's resizeMode (stretch, contain, cover, center = scale-down, repeat) are an enum key; tintColor a colour key; <image resizeMode="cover"> / objectFit as a literal attribute.
- Docs: docs/ui.md "Images in a box" (+ generated tables), docs/react-native.md (Image resizeMode and tintColor, style keys).

Decisions (reversible, RULES §4 not needed beyond this):
- Tint multiplies (criterion #3, the raster's tinted()); React Native's tintColor replaces the colour of opaque pixels: the same on white and grey template icons, documented.
- Command budget (design 5.6): at most 16 tiles on tier T0, 64 on T1, 4096 above, never more than commandsFree() - 2; past it the box gets fewer, larger tiles laid exactly over it, about the tiles' shape (uniform scale of the counts), one log line "an image repeated beyond N tiles is drawn as N larger tiles at most".
- The whole box is the positioning and painting area of a background image (zinc borders are paint-only; CSS's padding-box origin would differ by the border width); the box's one radius r rounds it (per-corner radii are not followed, as gradients).
- With a gradient and an image on one node, the gradient is painted over the image (CSS background-image: <gradient>, url(..): the scrim over a photo) instead of the last class winning.

Tests (Intel Mac, load 2.2 to 2.9 beside other trees):
- style_image (new, T1, 14 s): tests/golden/style-image (a 2:1 image, 64x32, in 48x48 boxes) frame hash 55bafcd3159e216f on the interpreter and the AOT build; check.py probes fill, contain, cover, none, scale-down, object-left, object-top-left, cover rounded, bg cover / contain / position / space / round / repeat-x, the style-object keys, the gradient over the image, tint-[#80c0ff], tintColor + resizeMode contain, resizeMode repeat and center: every probe within one unit of CSS's geometry and the raster's multiply. esp32 profile: the 8x8 tiles (36 on the desktop) are drawn as 4 x 4 = 16, with the log line once. GL replay vs software frame at the GL window's density (scale 2): pixels over 24: 0.000%, mae 0.005, max 3 (tolerance 0.01% / 0.1).
- Style keys checked equal to the class tokens (objectFit none + objectPosition '25% 100%', backgroundImage url(/x) + backgroundSize '50% auto' + backgroundRepeat repeat-y + backgroundPosition '10px 0'): same frame hash.
- PASS: ui_docs, jsx_style, ui, ui_style, ui_tokens (20 new tokens, the JSX check and the runtime agree), ui_transition, ui_state, style_gradient, style_image, style_shadow, style_transform, style_border, style_flex, style_size, style_dynamic, react_native, rn_showcase. tools/proto-capture compare --canary: 4/4; --all: 40/42 (3d/model and three/cubes, the known two).
- Not run: image_rect, image_rect_gl, gl_renderer (runtime/raster, gfx and the GL replay are unchanged).
- Performance: one branch per painted node (n.im.bg >= 0) and one per image node; not measured (no loop added on the default path).

For later.md:
- ZN-262: the GL replay keeps rounded CLIPs above CORNER = 32 device px square, so object-cover rounded-full images (and overflow-hidden rounded-full avatars) wider than 32 px at scale 2 lose their round corners on the GL renderer; an SDF clip in the shader would lift it.
- ZN-262: zinc:react-native has no ImageBackground and Image takes no source={{ uri }}; a View with backgroundImage: 'url(..)' covers the first.
- ZN-262: background images follow the box's one radius, not per-corner radii (rounded-tl-*), and take the border box as their area (no background-origin / -clip).
<!-- SECTION:NOTES:END -->
