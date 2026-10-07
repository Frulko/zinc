# Zinc UI styling system: coverage against CSS, Tailwind and React Native, and a plan for the gaps

Date 2026-10-07. Scope: audit and design, no code and no backlog change. Sources read: `next/RULES.md`, `next/ARCHITECTURE.md`, `docs/ui.md`, `lib/std/ui.ts` (2856 lines; the working tree holds another developer's uncommitted StyleSheet/Style work, read only, line numbers below are of that tree and will move), `lib/std/kit/*`, `compiler/src/{ui-style,css}.ts`, `docs/reports/ui-rendering-architecture.md` (cited as "RA", sections 4 and 7), `lib/gfx.d.ts`, `runtime/zrt_raster.h`, `runtime/raster.cpp`, backlog ZN-044, ZN-077, ZN-170..206, ZN-227, ZN-228, `next/tools/proto-capture` and `next/tests/golden/examples/proto` (41 files, every manifest row at `tol 0`).
Statuses: **supported** (works as in CSS for the common case), **partial** (works with a stated restriction or deviation), **missing**. "Task" points to the proposed backlog entries ST-nn of section 5 (placeholders, not created).

## 1. Summary

Coverage: 110 features audited, 26 supported, 29 partial, 55 missing (section 2). The 30 proposed tasks ST-01..ST-30 are in section 6; the five most valuable gaps are min/max sizes with the rest of flexbox (ST-04, ST-05), theme variables with dark mode and any-property state variants (ST-22, ST-24), full box-shadow and borders (ST-08, ST-10), 2D transforms with transitions and keyframes (ST-14, ST-25, ST-26), and text overflow control (ellipsis, line-clamp, decoration, italic: ST-18..ST-20).

What the engine is today, in one paragraph. Every style source (class tokens, `.css` rules compiled to tokens, `style={{...}}` objects, `StyleSheet.create` entries, array layers) ends in the same flat `UiNode` (ui.ts:130-193, about 95 fields, roughly 600 B per node by the measurement in the comment at ui.ts:207) through two string-keyed entry points: `applyToken` (ui.ts:560-685, an `if` chain over strings) and `applyNumber` (ui.ts:429-487, a second chain). Style keys are strings looked up with `indexOf` per node (ui.ts:425, 744). The layout is a single-pass flexbox (`measure` 817-877, `place` 878-948), the painter emits ten raster command kinds (`rrect`, `gradient`, `border`, `shadow`, `drawText`, `drawImage`, `clip`, `stroke`, `polygon`, `path`; `lib/gfx.d.ts`), and hover/focus/active exist only as colour fields on the node (ui.ts:174, 185, 191). That is a good core and a long tail of missing properties; none of the missing ones needs a new architecture, but three structural points decide the cost of everything else: string keys, a fat node, and a raster command set with one radius, one border width and one gradient angle per box.

## 2. Coverage table

Cost and tier columns are in section 3, parity risk in section 4. File:line is `lib/std/ui.ts` unless a path is given.

### 2.1 Style model

| Feature | Status | Evidence / restriction | Task |
|---|---|---|---|
| `StyleSheet.create`, `compose`, `flatten` | supported | class 113-126, lowered at build time; docs/ui.md:275-296 | |
| Style arrays, conditional layers, last wins | supported | `setStyles` 734-763, docs/ui.md:323-327; nested arrays and spreads are build errors (docs/ui.md:319) | |
| Inline style objects | partial | dynamic values must be numeric; enums and strings need named styles (docs/ui.md:317-321) | ST-01 |
| Class tokens (Tailwind subset) | partial | `applyToken` 560-685; no negative margins (`-mt-2` parses as unknown, 677-683), no `mx-auto`, no `inset-x`, `via-` and `font-medium` are accepted and ignored (590, 639) | ST-03 |
| `.css` import, classes with `:focus` / `:active` | partial | compiler/src/css.ts: declarations map to the same tokens; unknown property is a build error; colours drop alpha (css.ts:12-13) | ST-03, ST-11 |
| Arbitrary values `w-[240]`, `text-[13px]`, `bg-[#hex]` | partial | `num` 514-519: px only, no `%`, `rem`, `vh`, `calc` | ST-03, ST-04 |
| Unit set px, `%` (width/height), rem/em | partial | `%` only for width/height (454-457, ui-style.ts:79-82); rem/em fixed to 16 (docs/ui.md:311) | ST-04, ST-27 |
| Theme tokens (named roles) | partial | kit only: `Theme` signal with Tailwind colour names, `lib/std/kit/theme.ts:11-78`; a theme switch re-renders class strings | ST-22 |
| CSS variables / design tokens in style values | missing | no `var()`, no variable table; `@prop:hex` is a build-time constant (ui.ts:709-715) | ST-22 |
| Dark mode (`dark:` variant, OS scheme) | partial | `DARK` theme exists for kit components only (theme.ts:55-77); no `dark:` token, no OS preference hook | ST-22 |
| Breakpoints `sm: md: lg: xl: 2xl:` | supported | 558-566, re-evaluated on resize via `responsive` flag (158); keyed on window width only | |
| `max-*:`, arbitrary `min-[..]:`, orientation, container queries | missing | no such branch in `applyToken` | ST-23 |
| Pointer / hover media (`pointer-coarse:`, `hover-none:`) | missing | pointer type exists after ZN-228 (`dragScrolls`, ZN-228 notes) but is not a style condition | ST-23 |
| State `hover:` | partial | colours only (577); other `hover:` tokens are accepted and ignored (571) | ST-24 |
| State `focus:` and `focus-within:` | partial | bg, text, border colours only (576, 578) | ST-24 |
| State `active:` | partial | bg and text colours only; `active:border-*` returns false (579) | ST-24 |
| State `disabled:`, `focus-visible:`, `group-hover:`, `peer-*`, `aria-*`, `data-*` | missing | `disabled` is a behaviour flag (2358-2370), not a style condition | ST-24 |
| Variant stacking (`md:hover:bg-x`) | supported | breakpoint branch recurses with the variant (562-566) | |
| Transitions | partial | only the background colour eases (`effectiveBg` 1036-1044, `transition*` and `duration-*` 616-617); `transition` alone is a no-op (590) | ST-25 |
| Imperative tweens `animate(h, key, to, dur, easing)` | partial | 992-1014; `currentValue` knows only width, height, opacity, translate, scale and returns 0 for any other key (982-990); easings linear, in, out, inOut, spring (972-981) | ST-25 |
| Declarative `@keyframes` / `animation-*` / `animate-spin`, `animate-pulse` | missing | none in ui.ts, css.ts | ST-26 |
| Reduced motion (`motion-reduce:`) | missing | no hook | ST-26, ST-27 |
| Inheritance of text properties | partial | colour inherits from any ancestor (`textFg` 777-781); size, weight, family, tracking, leading only from a parent *text* node (`inheritText` 783-788) | ST-18 |

### 2.2 Box model and layout

| Feature | Status | Evidence / restriction | Task |
|---|---|---|---|
| Padding per side, shorthand | supported | tokens 681, keys 473-478; CSS 1-4 values in styles | |
| Margin per side | supported | 541-554, 475-476 | |
| Negative margins | missing | token parser rejects the leading `-`; layout arithmetic would accept negatives (`outerW` 815) | ST-03 |
| `margin: auto`, `mx-auto` | missing | no flag; main-axis free space is only given by `justify` and `grow` (908-917) | ST-03 |
| Percent lengths | partial | width and height only (`wFrac` 143, 818-819); no percent padding, margin, `top/left` | ST-04 |
| `viewport units`, `calc()`, `h-screen` | missing | | ST-04 |
| Border width per side | supported | `bT/bR/bB/bL` 163, 642-650, painted 1078-1084 | |
| Border colour per side | missing | one `borderColor` (162) | ST-08 |
| Border style dashed, dotted, double | missing | `border()` is solid only | ST-08 |
| Border takes layout space (CSS) | partial | border is paint only: content box ignores it (`measure` 842, `place` 886); Tailwind `border p-4` is 1 px off CSS | ST-08 |
| Per-side borders with rounded corners | partial | straight bands, no corner joins (comment at 1079) | ST-08 |
| Border radius, single value, `rounded-*`, `full` | supported | 539-540, 625-630, clamp at 1066 | |
| Per-corner border radius | missing | one `radius` (161); `Cmd` has one radius (`zrt_raster.h`, RA 1) | ST-08 |
| Outline, `ring-*`, `outline-offset` | missing | only a hard-coded 2 px yellow focus ring (1086) and a blue field border (1076, 1085) | ST-09 |
| `box-sizing` | partial | sizes behave as border-box (`ownW` sets `lw`, 875); content-box unavailable | ST-08 |
| `min-width`, `max-width`, `min-height`, `max-height` | missing | not in `applyToken` / `applyNumber` (docs/ui.md:319) | ST-04 |
| `aspect-ratio` | partial | only an `image` node keeps its intrinsic ratio (836-838) | ST-04 |
| `gap` | supported | 477, 670 | |
| `gap-x`, `gap-y`, `row-gap`, `column-gap` | partial | `gap-x-N` and `gap-y-N` both set the single `gap` (670) | ST-03 |
| `flex-direction` row, column | supported | 458, 591-592 | |
| `row-reverse`, `column-reverse` | missing | | ST-05 |
| `flex-wrap` | partial | row direction only (`n.row && n.wrap`, 849, 895); no `wrap-reverse`, no column wrap, no `align-content` | ST-05 |
| `flex-grow` | partial | integer weights only (`grow: i32`, 139); `flex-1` is grow 1 over the content size, not CSS `1 1 0%` (600, 922) | ST-05 |
| `flex-shrink`, `flex-basis` | missing | docs/ui.md:301 says so; children never shrink | ST-05 |
| `align-items` start, center, end, stretch | supported | 461, 631 | |
| `align-items: baseline`, `align-self`, `order` | missing | | ST-05 |
| `justify-content` (6 values) | supported | 460, 632-636, 911-917 | |
| `display: flex`, `none` | supported | `hidden` 595; `display: contents` is the `FRAGMENT` tag (6, 772) | |
| `display: grid`, `block`, `inline` | missing | RA 4.8 lists grid as a later mode | ST-05 |
| `position: absolute` and offsets `top/right/bottom/left`, `inset-0` | supported | 594, 604, 671-674, 937-947 | |
| `position: relative` offsets, `inset-x/y` | partial | `relative` is a no-op token (590) | ST-03, ST-06 |
| `position: sticky` | missing | | ST-06 |
| `position: fixed` | partial | `ui.openLayer` + `anchor` do it (2732-2830, docs/ui.md:158-175) | |
| `z-index` | missing | paint and hit order is tree order (1116); layers have a priority (2739) | ST-06 |
| `overflow` hidden, auto, scroll, per axis | supported | 596-599, clip with rounded corners 1108-1113, physics docs/ui.md:227-245 | |
| Scroll snapping, `scroll-padding` | missing | `ScrollAxis` has springs but no snap points | ST-06 |
| `visibility: hidden` | missing | `hidden` is display none (595) | ST-06 |

### 2.3 Visual effects

| Feature | Status | Evidence / restriction | Task |
|---|---|---|---|
| `opacity` | partial | multiplies each primitive (1060, 1064), so overlapping children blend twice; CSS isolates a group | ST-15 |
| `box-shadow`, Tailwind presets `shadow-sm..xl` | supported | five black presets, y offset and blur tables (1045-1046, 618-623, 1067) | |
| `box-shadow` offset, blur, spread, colour, multiple | missing | `shadow()` takes blur and colour, the UI exposes none of it | ST-10 |
| `box-shadow: inset` | missing | no inset flag on `SHADOW` (RA 4.2 plans it) | ST-10 |
| `text-shadow` | missing | | ST-21 |
| `drop-shadow` filter | missing | | ST-10, ST-16 |
| Linear gradient, 2 stops, to-b/t/r/l | supported | 637-640, 1068-1071 | |
| Gradient angle, multi-stop (`via-`), repeating | missing | `via-` accepted and ignored (639); `gradient()` has a vertical/horizontal flag only | ST-12 |
| Radial gradient | missing | raster has `grad == 3` (runtime/raster.cpp:65) but no UI key reaches it | ST-12 |
| Conic gradient | missing | | ST-12 |
| Background image, `size`, `position`, `repeat` | missing | images exist only as `<image>` nodes | ST-13 |
| `mix-blend-mode`, `background-blend-mode` | missing | | ST-15 |
| `filter: blur()` and others | missing | | ST-16 |
| `backdrop-filter: blur()` | missing | | ST-16 |
| Transform translate | supported | `tx`, `ty` 166, 433-434, 1062 | |
| Transform scale | partial | uniform, origin fixed at the top-left corner (440, 1055-1056, docs/ui.md:208-225) | ST-14 |
| Transform rotate, skew, `scaleX/Y`, matrix | missing | docs/ui.md:320 (RN transform array not implemented) | ST-14 |
| `transform-origin` | missing | | ST-14 |
| `clip-path`, `mask-image` | missing | only rect and rounded-rect clip via `overflow` (1112) | ST-17 |
| `cursor` | supported | 556-557, 582-587, docs/ui.md:177-185 | |
| `pointer-events: none` | partial | handler-less nodes are already transparent (docs/ui.md:85); no way to make a handler node transparent; `disabled` kills events for a subtree (2367) | ST-06 |
| `user-select` | missing | only text fields select | ST-21 |
| `visibility`, `content-visibility` | missing | | ST-06 |

### 2.4 Typography

| Feature | Status | Evidence / restriction | Task |
|---|---|---|---|
| Font size | supported | `text-xs..6xl`, `text-[n]`, `fontSize` 536-538, 659-663, 480 | |
| Font family | partial | one name (`font-[Family]` 608, `family` 171); a missing font falls back to `sans` (`fontOf` 789-796); no list, no per-glyph fallback | ST-18 |
| Font weight | partial | one bit: normal or bold, `font-medium` ignored (590, 605, 464); bold = `sans-bold` or `Family-Bold` file | ST-18 |
| Italic / oblique | missing | | ST-18 |
| Letter spacing | supported | `tracking-*` 612-615, `letterSpacing` px 467 | |
| Word spacing | missing | | ST-19 |
| Line height | supported | absolute px or `leading-N` (669, 797); default 1.4 x size; unitless multipliers are not expressed | |
| Text align left, center, right | supported | 609-611, 1101 | |
| Text align justify | missing | | ST-20 |
| `text-transform` | missing | | ST-19 |
| `text-decoration` (underline, line-through) | missing | | ST-19 |
| Ellipsis, `line-clamp`, `text-overflow` | missing | `wrapText` 800-814 only wraps | ST-20 |
| `white-space`, `word-break`, `overflow-wrap` | missing | `wrapText` splits on spaces, never breaks a long word, no `nowrap`, no `pre` | ST-20 |
| `vertical-align` | missing | text nodes are blocks; no inline formatting | ST-19 |
| Selection colour | partial | text fields only: constants 1148 and `setEditColors` (1566); no `selection:` token, static text is not selectable | ST-21 |
| Text colour with alpha | missing | `alphaOf` is used by `bg-` only (641); `ui-style.ts:75` rejects alpha on `color` | ST-11 |
| Tabular numbers, `text-wrap: balance` | missing | | ST-20 |

### 2.5 Images

| Feature | Status | Evidence / restriction | Task |
|---|---|---|---|
| Intrinsic size, one-side aspect | supported | 834-838 | |
| `object-fit`, `object-position` | missing | `drawImage` stretches to the box (1087) | ST-13 |
| Border-radius clipping | supported | radius argument of `drawImage` (1087, `lib/gfx.d.ts` line 34) | |
| Tint / colour filter | missing | | ST-13 |

### 2.6 Accessibility-related

| Feature | Status | Evidence / restriction | Task |
|---|---|---|---|
| Keyboard focus, `tabIndex`, focus scopes | supported | docs/ui.md:129-156 (behaviour, not style) | |
| Visible focus ring, customisable | missing | fixed 2 px yellow ring on any focusable (1086), also after a mouse click; no `focus-visible` | ST-09 |
| Reduced motion, forced colours / high contrast | missing | | ST-26, ST-27 |
| Text scaling (root font size) | missing | rem fixed at 16 px | ST-27 |
| `role`, `aria-*`, `sr-only` metadata | missing | no field on the node; only `inspectState` (2230) | ST-27 |
| Minimum hit-target helpers, contrast check of themes | missing | | ST-27 |

## 3. Cost and rendering-tier constraints

Tiers as in RA 4.13: **T0** ESP32 class, software band raster to RGB565, 160 KiB heap, 160-256 commands, f32; **T1** PS1 (fx12, 256 KiB heap, 512 commands) and PS2; **T2** GLES2 / WebGL1 (Pi 1-3, VideoCore IV: no derivatives, no sampler arrays, one render pass per frame); **T3/T4** GLES3 / WebGL2 / native. The SW raster is the oracle on every tier (RA 4.1 invariant 1); GPU backends must match it within a tolerance file (ZN-172). A "free" cost means no raster change and no extra command on the SW path.

| Group | Lowering to today's commands | New raster work | T0 cost / rule | T1 | T2 (GLES2) | T3+ |
|---|---|---|---|---|---|---|
| Layout properties (min/max, shrink, basis, order, align-self, aspect, z, sticky, margin auto, gap-x/y) | none | none | CPU only, in `measure`/`place`; no per-pixel cost; side record 1 pointer per node (4.3) | same | same | same |
| Border dashed/dotted | N small `rrect` bands; solid when radius > 0 or command budget low | none | up to 16 extra commands per box, else solid | same, bands map to `TILE` | same | same (SDF dash later) |
| Per-side colours, per-corner radii | 4 bands, existing corner restore | Scene `Quad` with 4 radii and 4 widths (RA 4.2, ZN-174) | radii use the largest corner (log once) | same | shader reads 4 radii | same |
| Outline, ring | `border()` on the expanded rect | none | 1 command | 1 | 1 | 1 |
| Box-shadow offset, spread, colour, multiple | existing `shadow()` with translated and grown box, 1 command per layer | none | max 2 layers; blur capped at 8 px (box approximation of 2-3 rings, RA 4.13) | pre-baked 9-slice | analytic blur (phase 1) | analytic |
| Inset shadow | none | `SHADOW` inset flag (RA 4.2) | degrade to a 2-band inner gradient or drop | drop | SDF `1 - alpha` | SDF |
| Gradient angle, N stops, radial | axis-aligned N stops = N-1 chained 2-stop rects (exact); radial reuses `grad 3` | `grad 5`: paint record in the point pool (the `grad 4` canvas paint already works for POLY, raster.cpp:152, 234) | 2 stops, linear axis only; others collapse to the first-last mix | vertical/horizontal Gouraud only | ramp texture 1x256 (RA 4.5) or <= 4 analytic stops | ramp |
| Conic gradient | none | `atan2` per pixel | not supported (solid average, logged) | not supported | not supported | fragment shader |
| Background image, repeat | `IMAGE` commands plus `clip` | none | no repeat above 16 tiles; `cover`/`contain` computed in UI | CLUT images | atlas pages (ZN-182) | same |
| `object-fit`, tint | `clip` + larger `IMAGE`; tint = modulate colour field of `IMAGE` | `IMAGE` multiply by `c1` | `cover` ok, tint ok on SW (one multiply per pixel) | tint unsupported | uniform | uniform |
| Colour alpha everywhere | already per-command `alpha` | none | free | semi-transparent modes only 0.5/1/0.25 (RA 4.11f), else pre-blend | free | free |
| 2D transforms rotate, skew, origin | none for 0/90/180/270; else new | Scene `Transform` 2x3 (RA 4.2); inverse-mapped SDF for `RECT/BORDER/SHADOW/IMAGE`; glyphs as transformed quads | multiples of 90 degrees only, others ignored with one log line; small rotated widgets (spinner 24x24 about 0.6M cycles/frame) allowed behind the `fx` module | multiples of 90 only | vertex transform, free | free |
| Group opacity, blend modes | none | `blend` byte in `Cmd.pad`; `LayerPush` for isolated groups (RA 4.2) | blend add/multiply/screen is one op per pixel; group opacity needs a temp band, so degraded to per-primitive alpha | PS1 add/sub/avg semi-trans map; rest normal | `glBlendFunc` for add/multiply/screen; others normal | FBO or framebuffer fetch |
| `filter: blur`, `backdrop-filter` | none | box blur on band with `r` extra rows (SW); layer render-to-texture (GPU) | off: replaced by the translucent fallback fill given by the `backdrop-*:` author token | off | at most 1 blur per frame (an FBO switch flushes a VC4 tile pass, RA 4.11b) | dual-Kawase, budgeted |
| `clip-path`, mask | rect clip stays | `CLIP` shape variants ellipse and polygon (point pool, needs R3.2 / ZN-181 triangulation on GPU) | bounding rect only | rect only | stencil (needs renderbuffer) or SDF for ellipse | stencil |
| Text transform, decoration, clamp, white-space | layout in `ui.ts` (string transforms, `RECT` lines for decoration, ellipsis via `textWidth`) | none | Latin-1 case tables only; clamp and ellipsis are CPU layout | same | same | full Unicode via ZN-114/ZN-165 |
| Italic, weights | baked font variants; synthetic shear as fallback | glyph row shear (cheap) | only the baked variants the app uses (flash cost per face, bake list from the build) | CLUT atlas per face | atlas | atlas |
| Text shadow | second `drawText` at an offset with alpha | none | offset only (2x text commands, budget guard) | offset only | offset only | blur through a layer |
| Theme variables, `dark:`, media/container queries, state variants | CPU only | none | one global table of colours (<= 64 x 2 x 4 B = 512 B) and one flag per node; restyle only flagged nodes | same | same | same |
| Transitions, keyframes | property slots (ZN-191, RA 4.8): value written, no re-record for transform and opacity | none | max 8 concurrent tweens (an `Anim` object is about 56 B), 30 fps ceiling | same | same | same |

Two raster-level facts shape the plan. First, the command is 48 bytes with one radius (`r`), one border width and one gradient direction; everything that needs per-side or per-corner data must wait for the Scene v2 `Quad` of RA 4.2 (ZN-174) or be decomposed into several commands. Second, a command past the list limit is dropped silently (`gfx.cpp` per RA 1), so every decomposition must check a remaining-budget counter and fall back to the plain form; the budget check is part of the design below, not an option.

## 4. Prototype parity impact

Goal: every `examples/*` entry stays pixel-identical (`tests/golden/examples/proto`, 41 PNGs, all rows `tol 0`, some `known` rows that "may not grow", e.g. ZN-223; gate `tools/proto-capture compare`). The prototype and the new engine share `lib/std/ui.ts`, so a style change is a change of both oracles at once: a regression would not show against the prototype, only against the committed PNGs. Hence:

1. **Additive only.** A new key, token or variant must be inert when absent. No default changes: shrink stays 0, `flex-1` keeps grow over content size, border stays paint-only, opacity stays per-primitive, `gap-x/gap-y` fix is the only change of an existing token and no example uses `gap-x-` or `gap-y-` (grep of `examples/`: 0 files). CSS-faithful behaviour is opt-in (`basis-0`, `box-border-layout`, `isolate`, `shrink`).
2. **Neutrality gate.** Before and after each task: `tools/proto-capture compare` over the whole manifest (tol 0, `known` rows unchanged), `tests/t1/ui.sh` (frames 1 and 40 of `tests/visual/ui.tsx`), `tests/t0/jsx_style.sh`. A task that needs a manifest row changed is wrong by construction.
3. **New goldens are ours.** The prototype cannot render `rotate` or `dashed`, so new scenes get goldens under `tests/golden/ui-style/` captured from the SW f32 backend of the new engine, cross-checked by the AOT and `--engine quickjs`, and compared on other backends with per-tier tolerance files (ZN-172). The prototype's `compiler/` is not changed except for fixes (ARCHITECTURE.md); the style-lowering rules of `compiler/src/ui-style.ts` that ZN-077 ported to `next/src/frontend` are extended on the Next side only, and the key tables are generated into docs so the two cannot drift silently.
4. **Sequencing.** `lib/std/ui.ts` carries uncommitted work of another developer. Nothing in section 5 starts before that work is committed (ZN-077 closes) or the task uses the partial-staging method recorded in ZN-228's notes.
5. **Highest risk per area.** Layout tasks (ST-04, ST-05, ST-06) touch `measure`/`place` that every example uses: keep the legacy loop as the path when no child of the line has a side record, and add the differential layout test of ZN-189 to their gate. Painter tasks (ST-08, ST-10, ST-12) must reproduce today's preset shadows, borders and gradients bit-for-bit through the new code path (presets are expressed as the new parameters and compared to the old output). Text tasks (ST-18..ST-21) change what `wrapText` returns only when a new property is set.

## 5. Design for the missing parts

### 5.1 Parsing: three entry points, one property table

Today `applyToken`, `applyNumber` and `sheetNumber` each re-implement the same properties with string comparisons (about 60 string compares per key in the `applyNumber` chain). Proposal:

* A `PROP` table of small integer ids, one row per property: `{id, kind (length | int | colour | enum | flag), min, max, side-record field, dirty class}`. The dirty class is the invalidation class of RA 4.8: `layout`, `paint`, `slot` (transform, opacity, colour lerp). `applyProp(n, id, value)` is the only writer of node style.
* **StyleSheet and inline objects:** the compiler lowers each key to `(id, number)` pairs. `Style` becomes `{ids: i32[], values: number[]}` (today `keys: string[]`, ui.ts:114). Non-numeric values are encoded at build time the way `ui-style.ts` already does for enums (ui-style.ts:17-23) and colours (`@key:hex`, ui.ts:709-715, kept because 24-bit colours overflow fx12 `number`): enums to ints, colours to `i32` RGBA, lists to fixed slots (`boxShadow` to `shadow0X, shadow0Y, shadow0Blur, shadow0Spread, shadow0Color, shadow0Inset`, same for `shadow1`; gradient to `bgGradAngle`, `bgGradStopN`, `bgGradPos0..`, `bgGradCol0..`; `transform: [{rotate:'45deg'}, {scale:2}]` to `rotate`, `scaleX`, `scaleY` when the order is the canonical one, otherwise a build error because the affine product is not commutative). Unsupported on the build's profile: warning plus drop (section 5.6), never silent.
* **Class tokens:** a prefix table (`rotate-`, `-mt-`, `min-w-`, `ring-`, `shadow-[`, `bg-[linear-gradient(`, `dark:`, `max-lg:`, `group-hover:`, `aria-[..]:`) maps to `(id, value)`; value parsers for lengths (`px`, `%`, `rem`, `vw`, `vh`, fractions, negative), colours (hex, `/alpha`, `rgb()`, `hsl()`, `var(--x)`), enums. Tokens that need no runtime string work (static class strings) are tokenised at build time (css.ts already does this for `.css`), dynamic strings use the same table at run time.
* **Variants** are a prefix chain evaluated left to right into a condition set `{scheme, minW, maxW, container, pointer, orientation, reducedMotion}` plus one state in `{none, hover, focus, active, disabled, focusVisible, within, group, peer, aria}`; unconditional or statically true conditions are folded at build time.
* **Order of resolution** stays as in docs/ui.md:323-327: base classes, then style layers left to right, then imperative `setNumber`/animations. The state overlays are applied last in their own pass so that removing a state returns to the base.

### 5.2 Storage and the memory budget on small targets

* Core `UiNode` keeps the fields that every node pays for (geometry, flags, background, border colour/width, radius, size, text basics). New properties never add fields to it.
* **Side records, allocated on first write**, the same pattern as `hs: Handlers | null` and `ed: Edit | null` (ui.ts:188-189): `lx: LayoutExt` (min/max, shrink, basis, order, selfAlign, aspect, z, sticky offsets, snap, margin-auto bits, percent paddings, rowGap; about 16 fields), `dx: Deco` (per-corner radii, border style and per-side colours, outline, up to 2 shadow specs, gradient spec, background image spec, tint, object-fit, text shadow), `fx: Fx` (rotate, skew, scaleX/Y, origin, blend, filter, backdrop, clip shape), `tx: TextExt` (italic, transform, decoration, clamp, word spacing, white-space, family list, weight 100-900), `st: States` (per state: `ids[]`, `values[]`), `a11y` (role, label, hidden). Cost when unused: five nullable pointers (20-40 B); a typical page pays for a record on 5-10% of its nodes.
* **Net saving, not growth.** The 12 per-state colour fields (`focusBg, activeBg, focusFg, activeFg`, ui.ts:174, `hoverBg, hoverFg, hoverBorder, focusBorder` 185, `withinBg, withinFg, withinBorder` 191), the transition fields (`transMs, curBg, fromBg, transStart` 175), the gradient fields (160) and the four side widths (163) move into `st`/`dx`. Estimate: 25 fields, about 100 B per node (roughly 17% of the 600 B figure), about 17 KiB on a 171-node page; to be measured with `zinc mem`/`tools/resmon` in ST-02 and recorded in the task notes (RULES 5, measurements beat estimates).
* **Global tables:** the theme variable table (`i32[64]` per scheme, 512 B for two) and the keyframe registry (build-time constants in flash on firmware).
* **Compatibility with ZN-189 (SoA):** side records become sparse parallel arrays indexed by handle; the field list above is the contract, not the object layout.
* **Code size:** the extended painter and parsers live in a module `zinc:ui/fx` that registers hooks (`paintDeco`, `layoutExt`, `parseExtToken`); the compiler adds the import only when a lowered style op or token needs it, so an ESP32 app that uses none of it ships none of it (ST-29 measures `size` before and after).

### 5.3 Layout

* `measure`: after `ownW/ownH`, clamp by `lx.min/max` and derive from `lx.aspect`; percent padding and margin resolve against `maxW`.
* `place`: when no child of the line has `lx`, run today's loop unchanged. Otherwise run the CSS resolve-flexible-lengths loop (freeze items that hit min/max, at most 3 passes) with `basis`, `grow` (fractional), `shrink` (explicit only), `order` (stable sort of the child list in `flat()` 768-775, only if the parent flag `hasOrder` is set by a child setter), `alignSelf` (override of `n.align` at 926-929), `margin auto` (free-space share before `justify`), `rowGap`, reverse directions (iterate the list backwards), column wrap (symmetrical to row wrap).
* Grid: out of scope for this plan except as `display: grid` with a fixed-track subset in ST-05 if the flex work finishes under budget; RA 4.8 already records it as a later display mode.
* `z-index`: parents with a child `z != 0` set `hasZ`; paint and `hitIn` (1811) iterate a z-stable order only for such parents.
* `sticky`: resolved at paint and hit time from the scroll parent's `sy` (clamped to the parent's content box): no relayout, no new commands.
* Scroll snap: `snap-x|y`, `snap-start|center|end` give snap points collected at release; `releaseAxis` (1695) targets the nearest instead of the inertia end; same spring (`springStep` 1703).
* Container queries: nodes with the `container` flag publish their laid-out width; a restyle triggered by a width change reruns `layout()` at most once more (2 passes total, bounded).
* Differential oracle for ST-05: a headless browser lays out generated flex trees offline; the boxes are stored as JSON fixtures (no browser dependency in the build); Yoga/Taffy stay oracles only, as RA 4.8 decides.

### 5.4 Painting by the software raster

* Rule: **lower into existing commands first, change the raster second**, because the raster and the damage hash (ZN-179) already know the ten kinds; every new command field must be part of the diff hash.
* A `paintBox` function replaces the inline sequence at ui.ts:1066-1086: shadows (loop over `dx.shadow[]`), fill (flat, gradient, image), borders (uniform `border()`, per-side bands, dashed bands), outline/ring, then content. Presets `shadow-sm..xl` and today's uniform paths are expressed as the same parameters and must compare bit-exact to the old output (section 4).
* Gradient `grad 5` for rects: a paint record in the point pool `[type, x0, y0, x1, y1, n, (pos, colour) * n]` (the canvas `grad 4` path, raster.cpp:152, 234, 273). Axis-aligned multi-stop on T0 lowers to chained rects with no raster change.
* Transforms: the painter keeps accumulating translate/scale (`paint` 1057-1062) and passes a 2x3 matrix to the raster only when rotate or skew is present, so existing frames take the old path. The raster evaluates each primitive's SDF in local coordinates (inverse map), AA at the edge as now; glyph runs under rotation use bilinear transformed quads. Hit testing inverts the same matrix (`boxOf` 1831 already inverts translate/scale).
* Blend, tint, alpha ramps: one byte `blend` in `Cmd.pad` and one colour for `IMAGE` tint; both skipped by a branch when zero.
* Blur and backdrop blur on bands: the band is rendered with `r` extra rows, blur applied on the composited rows below the node (three box passes, no new library), then the node's own commands. `damage` grows by `r` around the node so the diff stays correct.
* Clip shapes: `CLIP` carries `kind`; ellipse and polygon coverage are computed per pixel in the clip stack the raster already keeps (`corner_px`, raster.cpp:463-512); polygon mask uses the existing polygon fill into a one-row coverage buffer.
* Text: decoration and ellipsis are layout and extra `rrect` commands; italic is baked when the build has the face, else a synthetic shear of glyph rows; `text-transform` and `line-clamp` rewrite `lines[]` in `wrapText`; `white-space: nowrap|pre` bypasses the word splitter; `text-shadow` is a duplicated run.
* Images: `object-fit: cover` = `clip(box)` + `drawImage` at the oversized rect; `contain` = smaller box; both zero raster change.

### 5.5 Painting by the GPU backend (RA roadmap R-tasks)

* All new records enter the Scene v2 (ZN-174): `Quad` (4 radii, 4 widths, fill paint, border paint, dashed/inset flags), `Shadow` (+ inset, spread), `Transform`, `LayerPush/Pop` (opacity, blend, filter, `cache_key`), `Clip` shapes, `Image` (+ tint, uv rect).
* Ranks (ZN-177) and batches (ZN-178) use the clipped **axis-aligned bounds of the transformed primitive including shadow, outline and blur extent**; features (dashed, inset, gradient type) become shader feature flags and not batch breaks (RA 4.4 rule 2).
* T2 shaders (GLES2 floor, ZN-176): no derivatives, AA from a `pixel_size` uniform; gradients through a 1x256 ramp texture in the atlas pages (ZN-182); rotated quads by vertex transform, edge AA by SDF in local space; blend through `glBlendFunc` where exact, else normal; backdrop blur through one render-to-texture pass per frame at most; clip shapes through stencil only when the renderbuffer exists (caps from ZN-183, quirks table), else bounding box.
* T3: instancing, `sampler2DArray` pages, dual-Kawase blur, conic gradients in the fragment shader, framebuffer-fetch blend modes when the cap bit is set.
* Property slots (ZN-191): `rotate`, `scale`, `translate`, `opacity`, colour lerps and filter amounts are slot-dirty, so transitions and keyframes on them re-record nothing and cost one uniform/instance patch on GPU.
* Every degrade is a `Caps` decision logged once (`zinc doctor`), never a crash (RA 4.13 limit-handling rule).

### 5.6 Degradation on tiny profiles

* `targets/capabilities.json` gets a `ui.style` level per profile (ST-29): `core` (today's set plus layout and colour additions that cost no raster work), `extended` (borders, shadows, gradients, transforms 90 degrees, text effects), `full` (blur, clip shapes, conic, group opacity, backdrop). Defaults: esp32 and ps1 `core`+selected `extended` bits, ps2 and rpi1 `extended`, desktop and wasm `full`.
* The build diagnostic for a key above the level: `warn` and drop (default), `strict` for an error, `off` to be silent; `zinc.json` `"ui": {"style": "strict"}`. A fallback per feature is named in section 3 and implemented once, in the `paintBox` function, not scattered.
* The command budget guard: before emitting N decomposed commands (dashes, bands, tiles, text shadow, shadow layers) the painter asks `budgetLeft()`; below a profile threshold (T0: 32, PS1: 64) it emits the plain form.
* Fixed point: all new values are lengths (`number`), enums and `i32` colours; no new transcendental in the paint path on fx12 (rotate uses a sine table lookup built at start, 91 entries; `atan2` only on T3+).

## 6. Proposed backlog tasks

Sizes: S = 1 day, M = 2, L = 3 (as RA 7). Each task ends with the neutrality gate of section 4 (`tools/proto-capture compare` unchanged, `tests/t1/ui.sh`, `tests/t0/jsx_style.sh`); that line is not repeated. "Golden" means `tests/golden/ui-style/<scene>.png` from the SW f32 backend; "tier" means a tolerance file per backend as in ZN-172.

| ID | Title | Size | Depends on | Acceptance criteria |
|---|---|---|---|---|
| ST-01 | Property ids instead of string keys (`PROP` table, `Style{ids,values}`, `applyProp`) | M | ZN-077 | 1. Every lowered style of the 41 manifest entries produces the same node state (dump compare `ui.dump()` before/after). 2. `jsx_style.sh` expectations regenerated, key names kept in diagnostics. 3. `applyNumber` string compares gone: style apply of 10k keys measured faster (before/after in the notes). |
| ST-02 | Side records and move state colours out of `UiNode` | M | ST-01, ZN-189 | 1. Hover, focus, active, focus-within colour tests and the hero focus frame unchanged. 2. Bytes per node and a 171-node page measured with `zinc mem`: at least 15% lower. 3. A node with no extended property allocates no side record (assert in a T0 test). |
| ST-03 | Class-token parser table: negative margins, `mx-auto`, `inset-x/y`, `gap-x/gap-y`, arbitrary `%`, `rem`, `vh` | M | ST-01 | 1. T0 parser test accepts and rejects a list of 60 tokens (accepted ones set the expected fields, unknown ones keep the diagnostic). 2. `gap-x-4 gap-y-2` golden on a wrapped row. 3. `isKnownClass` and the docs table generated from the same table. |
| ST-04 | Size constraints: min/max width and height, aspect-ratio, percent padding/margin/offsets, `vw/vh/h-screen` | M | ST-02 | 1. 40 generated cases equal the browser fixtures (+-1 px). 2. Golden of a card grid with `aspect-video`, `max-w-md` centred. 3. No allocation added to `measure` (count from ZN-189's counter). |
| ST-05 | Flex completeness: shrink, basis, order, align-self, align-content, reverse, column wrap, fractional grow; opt-in CSS semantics | L | ST-02, ST-04 | 1. 200 random flex trees (offline browser fixtures) match within 1 px when the opt-in props are set. 2. With no opt-in prop the old loop runs: all proto goldens tol 0. 3. Golden for `order`, `self-end`, `basis-0` vs legacy `flex-1`. |
| ST-06 | Stacking and positioning: `z-index`, `sticky`, relative offsets, `visibility`, `pointer-events`, snap | M | ST-02, ZN-189 | 1. Hit test follows z order (pointer script on overlapping nodes). 2. Sticky header golden at three scroll offsets. 3. Snap test: after release the offset equals a snap point, deterministic with the virtual clock. |
| ST-07 | Scroll snap and scroll padding (split of the snap part of ST-06 if ST-06 exceeds 1.5x) | S | ST-06 | 1. Wheel notch and touch fling end on snap points. 2. `scroll_physics.tsx` conformance output unchanged without snap props. |
| ST-08 | Border model: dashed/dotted, per-side colour, per-corner radius, border in layout (`box-border-layout`) | M | ST-02, ZN-174 | 1. Goldens: dashed, dotted, four colours, four radii, on SW f32 and GL within tier tolerance. 2. esp32 profile: dashed becomes solid and radii the largest corner, with one log line (test). 3. Presets `border`, `border-2`, `rounded-*` bit-exact with the old path. |
| ST-09 | Outline, ring, `focus-visible`, customisable focus ring | S | ST-08, ZN-228 | 1. Default focus ring frame unchanged (hero golden). 2. `ring-2 ring-indigo-500 ring-offset-2` golden; `focus-visible:` shows after keyboard, not after a mouse press (pointer-type test from ZN-228). 3. Ring is one `border()` command (command-count assertion). |
| ST-10 | Box-shadow: offset, blur, spread, colour, multiple, inset, `drop-shadow` as box approximation | M | ZN-174, ZN-178, ST-11 | 1. `shadow-sm..xl` bit-exact with today. 2. Goldens of two-layer and inset shadows; GL analytic blur within tolerance. 3. T0: more than 2 layers or blur > 8 px degrade as specified (test) and inset drops with a log line. |
| ST-11 | Colour model: alpha on text, border, shadow and CSS colours; `rgb()/hsl()/currentColor`; i32 RGBA on fx12 | S | ST-01 | 1. Parser tests for 30 colour strings including `/50`. 2. Compile for `ps1` (fx12): no overflow, colours identical to the f32 build. 3. `text-white/60` golden. |
| ST-12 | Gradients: angle, N stops, radial, repeating, conic; Tailwind `via-`, `bg-[linear-gradient(..)]`, `backgroundImage` | L | ZN-174, ZN-176, ZN-182, ST-11 | 1. Axis-aligned multi-stop equals the chained-rect lowering pixel for pixel; 45-degree and radial goldens on SW. 2. GL ramp texture within tolerance on llvmpipe; T2 uses at most the ramp page (atlas stats). 3. esp32: 2 stops linear only, others collapse with a log line; conic only on T3. |
| ST-13 | Background images and `<image>` fit: `object-fit/position`, `bg-size`, `bg-repeat`, tint | M | ZN-182, ST-02 | 1. `cover`, `contain`, `fill`, `none` goldens with a 2:1 image in a 1:1 box. 2. Repeat respects the command budget (16 tiles on esp32, test). 3. Tint multiplies on SW and GL within tolerance. |
| ST-14 | 2D transforms: rotate, skew, `scaleX/Y`, origin; RN `transform` array lowering; hit testing | L | ZN-174, ZN-191, ST-02 | 1. Goldens: rect, border, shadow, image, text at 15, 45, 90 degrees. 2. Pointer hit at the corner of a rotated node and a scaled-then-rotated child. 3. Today's `scale` frames (proto) identical; esp32 and ps1 honour 0/90/180/270 only, others ignored with one log line. |
| ST-15 | Group opacity (`isolate`) and blend modes | M | ZN-174, ZN-178 | 1. Overlap scene differs from per-primitive opacity exactly as CSS group opacity (golden). 2. add, multiply, screen exact on SW, GL via `glBlendFunc` within tolerance. 3. PS1 maps add/sub or degrades to normal with a log line. |
| ST-16 | Filters: `blur()`, `backdrop-blur`, brightness/grayscale; drop-shadow filter | L | ZN-174, ZN-183, ZN-178 | 1. Box-blur golden on SW with correct damage growth (diff test). 2. Pi 3: at most one blur pass per frame, frame p99 not worse than SW + 20% (R3.1 criterion style). 3. esp32: blur ignored, `backdrop-blur bg-white/70` fallback fill is what shows. |
| ST-17 | `clip-path` (inset, circle, ellipse, polygon) and gradient masks | L | ZN-181, ZN-174 | 1. Coverage goldens for each shape; hit test follows the shape. 2. T0/T1 clip to the bounding rect with one log line. 3. GL stencil path gated by caps (forced-failure test falls back to SW per ZN-183). |
| ST-18 | Typography A: font family list, weights 100-900 to baked faces, italic | M | ZN-114, ST-02 | 1. A missing first family falls through the list (test with a missing asset). 2. The build bakes exactly the faces the app names (resource list test); proto text goldens tol 0. 3. Synthetic italic golden; weight `500` maps to the nearest baked face deterministically. |
| ST-19 | Typography B: `text-transform`, `text-decoration`, word spacing, `vertical-align` | M | ST-18 | 1. Goldens for underline, line-through, uppercase, word spacing. 2. Decoration is `rrect` commands only (command-count test). 3. Non-Latin-1 uppercase works on desktop profiles via ZN-165 tables, ignored with a log line on esp32. |
| ST-20 | Text layout: `white-space`, `overflow-wrap`, `word-break`, ellipsis, `line-clamp`, justify, `balance` | L | ZN-114, ZN-165, ST-19 | 1. `line-clamp-3` on a 600-char string yields 3 lines ending in the ellipsis (exact string test, then golden). 2. Explicit `\n`, `nowrap` and `pre` tests; default wrapping identical (proto text goldens). 3. `measure` allocations not higher (ZN-189 counter). |
| ST-21 | Text shadow, selection colours, `user-select` | M | ST-11, ST-19 | 1. Offset shadow golden (two runs). 2. `selection:bg-*` colours the field selection and a selectable static text (pointer test). 3. T0 budget guard drops the shadow below 32 free commands. |
| ST-22 | Theme variables and schemes: `var(--x)`, `dark:`, `ui.setScheme`, OS preference hook, kit on variables | L | ST-02, ST-11, ZN-193 | 1. Switching scheme restyles only flagged nodes (count equals the flagged count) and re-renders no component. 2. Default light output unchanged (proto goldens); a dark golden of `examples/ui/kit-gallery`. 3. The theme table stays under 1 KiB and `zinc.json` can set the initial scheme. |
| ST-23 | Media and container queries: `max-*`, `min-[..]`, orientation, `pointer-coarse`, `hover-none`, `@container`, safe-area/keyboard inset | M | ST-02, ZN-227, ZN-228 | 1. Feeding mouse then touch events flips `pointer-coarse:` styles (test using `ui.touchAt`). 2. Container query settles in at most 2 layout passes (counter) and survives a resize script. 3. The virtual keyboard inset of ZN-227 is readable as a length (`env(keyboard-inset)`) and moves a bottom-pinned bar (golden). |
| ST-24 | State variants for any property: hover, focus, active, disabled, focus-visible, group/peer, `aria-*`, `data-*` | L | ST-02, ST-22 | 1. `hover:opacity-80 hover:-translate-y-1 hover:shadow-lg` golden through `ui.pointerAt`. 2. `disabled:` golden; a paint-only state change causes no relayout (layout counter). 3. "Accepted and ignored" `hover:` tokens are gone: unknown ones are build errors. |
| ST-25 | Transitions on any animatable property; `animate()` knows every key | M | ZN-191, ST-24 | 1. Virtual-clock samples at 0, 50, 100% for opacity, translate, rotate, colour, width. 2. Opacity and transform transitions record nothing per frame (ZN-191 criterion). 3. esp32 caps at 8 concurrent tweens and jumps beyond (test). |
| ST-26 | Keyframe animations and `reduce-motion` | M | ST-14, ST-25 | 1. `@keyframes` in `.css` and `ui.keyframes` give the same frames at fixed ticks (golden). 2. `animate-spin`, `animate-pulse`, `animate-ping` presets. 3. With reduced motion set, infinite animations hold the first frame and transitions jump (test). |
| ST-27 | Accessibility styles and metadata: `role`, `aria-*`, `sr-only`, root font scale, forced-colours theme, contrast check | M | ST-22, ST-23 | 1. `ui.inspect` dumps role/label/hidden for a form (text expectation). 2. `ui.setRootFontSize(20)`: rem lengths scale, 16 leaves every proto golden unchanged. 3. A tool checks WCAG AA contrast of `LIGHT` and `DARK` kit themes and fails below 4.5:1 for text roles. |
| ST-28 | Style conformance suite: per-group scenes, tier tolerance files, neutrality script, feature-matrix scene per forced tier | M | ZN-172, ZN-175, ZN-174 | 1. About 30 scenes under `tests/golden/ui-style/` run in T1 in under 3 minutes. 2. A `tools/style-neutrality` script runs the proto compare and fails on any manifest or `known` row change. 3. The B10 feature-matrix scene renders at forced T0, T1, T2 and T3 against per-tier goldens. |
| ST-29 | Style capability levels, profile degradation and module split (`zinc:ui/fx`) | M | ZN-175, ZN-183, ST-02 | 1. An esp32 build of hero-lite without extended keys: `size` of the image within +-1% of the baseline (recorded). 2. A program using `blur` on esp32 builds with a named warning, fails under `"style": "strict"`. 3. `zinc doctor` prints the style level and the properties ignored by the last build. |
| ST-30 | Docs and Figma mapping generated from the property table | S | ST-01, ST-03 | 1. The property table in `docs/ui.md` is generated and checked in CI (diff test). 2. `docs/figma-ui.md` lists the Figma property to style key mapping for the new keys. 3. `isKnownClass` and the CSS importer reject exactly the same set (test). |

Suggested order: ST-01, ST-02, ST-03, ST-11 (foundations, no visible change), then ST-04..ST-06 and ST-09 (layout and focus, highest daily value), ST-08, ST-10, ST-12, ST-14 (visual parity with CSS), ST-18..ST-20 (text), ST-22..ST-25 (themes, queries, states, transitions), the rest as needed. ST-28 starts with ST-08 and grows with each task.

## 7. Risks and open points

* The prototype, the new engine and the kit share `lib/std/ui.ts`; the in-flight StyleSheet work must land first (section 4.4).
* The per-node estimate of 100 B saved is arithmetic on field counts, not a measurement; ST-02 decides whether the side-record design stays.
* Scene v2 (ZN-174) is the gate for per-corner, inset, transform and filter on the GPU path; the SW path can ship each feature earlier through command decomposition, at the price of the command budget on T0 and T1.
* CSS deviations kept for parity (flex-1 over content size, default shrink 0, paint-only borders, per-primitive opacity) will surprise authors porting CSS; the opt-in switches in ST-05, ST-08 and ST-15 plus a doc page "Differences from CSS" (in ST-30) are the mitigation.
* VideoCore IV blur and stencil behaviour is unmeasured; the one-pass-per-frame limits in section 3 are proposals to validate with the stress rules of RA 4.6 (S2).
