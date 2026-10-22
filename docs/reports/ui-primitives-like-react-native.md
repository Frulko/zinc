# zinc:ui primitives as light and free as React Native's (ZN-774.18, design)

Date 2026-10-22. Criterion 1 of ZN-774.18: what zinc:ui imposes today, React Native's model, the options, a decision. No code changed.
The owner: zinc:ui is "trop figé et trop lourd"; wanted "allègement et plus souple, moins figé graphiquement à la manière de ce que propose react-native".

Method. The main tree's `build/zinc` at 835f43f8, headless, deterministic, interpreter, on the Intel Mac (load 5 to 11 while measuring, so the
times are indicative; sizes and counts are exact). Scratch programs in `/private/tmp/claude-501/ui-design/` (a bare View, Text, Button, View with
onClick, Input, TextArea; the same under the react-native preset; a style-object-only program; a 400-node page). The migration was measured by
pointing `ZINC_ROOT` at a scratch root whose `lib/std/ui.ts` is a patched copy (everything else symlinked to the tree): an unpatched copy gives
0 px of difference on every frame, so each difference below is the patch's own. File:line is `lib/std/ui.ts` unless a path is given.

## Summary

- The core draws two looks nobody asked for: a dark slate `<Button>` (`#334155`, padding 4/8) and a dark slate `<Input>`/`<TextArea>`
  (`#1e293b`, light text, grey border, radius 6, 14 px). Text is white by default in the Solid/React model. These come from a dark-window era
  and are undocumented. They already cause two visible bugs: lesson 12's field types invisible text (near-white on `bg-white`), and React
  Native's `TextInput` types black text on the dark field.
- Measured on 44 offline UI projects (lessons, examples, templates) and the 19 UI rows of the frozen prototype goldens, at frame 30:
  removing the Button fill moves **nothing**; making text black moves **nothing**; removing the field look moves 4 programs; removing the
  Button's padding 2, its centring 6 (all five lessons 07 to 11 lean on it).
- Style objects already cover most of React Native's keys (borders per side, radius per corner, shadow, elevation, opacity, transform array).
  Ten families are still class-only (z-index, italic, underline, uppercase, text shadow, colour alpha on text and borders, medium/semibold
  weights, pointer events, cursor, focus ring and outline) and the compiler refuses them in a `style`.
- Weight: a program that uses only primitives and style objects compiles the whole library anyway: 274 functions, 71k ZBC instructions,
  3.08 MB of C++ (a zinc:gfx program: 13 functions, 1.2k, 70 KB) and starts in about 350 ms on the interpreter (67 ms). 16% of that code is the
  class parser it never calls, 13% the text-field editor it never uses. A node is 1,376 bytes, and every class change allocates a second,
  throwaway node just to read the defaults.
- Recommendation (option E, 60 points): neutral primitives, a codemod that hands the old looks to the programs that relied on them first
  (so no example pixel moves), the missing style keys, the react-native preset made exact, and the class parser compiled only into programs
  that use classes. Seven steps, one session each (section 4).

## 1. What zinc:ui imposes today

### 1.1 Default looks, element by element

`defaults()` (495-501) runs for every new node and again on every class rebuild (`resetStyle`, 2585-2588). The JSX host tags are
View, Text, Button, Image, ScrollView, Canvas, Input, TextArea (`src/frontend/jsx.cpp:26`); there is no host Pressable: `<View onClick>` is one.

| Element | Draws or applies without being asked | Evidence |
|---|---|---|
| View | nothing (no fill, no border). A border width without a colour is Tailwind's grey-200 `#e5e7eb` (React Native: black; Tailwind 4: currentColor) | 346 |
| Text | colour **white** in the Solid/React model, black under the react-native preset; 16 px (14 under the preset); Inter | `textFg` 2708-2712, `RN_STYLE` 3302, `DEFAULT_TEXT` 23 |
| Button | fill `#334155` (slate-700), padding 4 top/bottom 8 left/right, content centred both ways, focusable | 496 |
| any node with `onClick` (View, Text, Button) | becomes focusable; dims to 0.6 while pressed (80 ms in, 150 ms out) | `listen` 612, press dim 5693-5720, docs/ui.md:252 |
| Input, TextArea | fill `#1e293b`, text `#f1f5f9`, 1 px `#475569` border, radius 6, 14 px, padding 6/8; once focused a border of at least 2 px `#3b82f6`, **even with `borderWidth: 0`**; placeholder `#64748b`; selection `#3b82f6` at alpha 110 | 498-500, 4008, 4020, 4382, 4207, 4325 |
| any focusable, keyboard focus | 2 px ring `#facc15` 2 px outside the box (not on fields) | 4029; the web page: `targets/web/dom.js:62` |
| ScrollView | overlay bars `#64748b` while scrolling (800 ms then a 400 ms fade; Android's timing and glow on Android) | `paintScrollbars` 4177-4195 |
| Image, Canvas | nothing | |
| the window | a background colour is a required argument of `render(App, background, onTick)` | `lib/std/solid.ts:314` |

What a bare program shows (scratch `prims`, `render(App, 0xf3f1ec)`, no class on the Text): the text is white on the light window, i.e.
invisible; the Button is a full-width slate bar; Input and TextArea are dark slate panels. The same elements under the react-native preset:
black text, a Pressable that shows nothing at rest, and `TextInput` still a dark slate field, now with **black** text on it
(`lib/std/react-native.tsx:354` removes the border and sets black, the fill of 499 stays).

Defects found on the way (not the task's, listed for the coordinator):

- Lesson 12's field `className="grow h-11 px-3 rounded-lg bg-white border border-slate-300"` (`docs/learn/samples/12-a-small-app/src/main.tsx:49`)
  keeps the default text `#f1f5f9`: what a beginner types is near-white on white (rendered with a value in scratch `field`).
- zinc:ui/kit has no Input: a kit app (light, shadcn) that writes `<Input>` gets the dark slate field.
- None of these defaults is written in docs/ui.md or the lessons.
- docs/ui.md:817-818 says the React Native transform array is not implemented; the same section documents it as implemented.
- docs/ui-kit.md:63-67 and 100 still write the props `class?` (a banned spelling, AGENTS.md).

### 1.2 Behaviours a program cannot turn off, or only with a class

| Behaviour | Opt-out today |
|---|---|
| pressed dim on every `onClick` node | `pressFeedback={0}` per node (also a style key), `ui.setPressFeedback(false)` per app, an `active:opacity-*` class |
| keyboard focus ring `#facc15` | classes only: `outline-none`, `ring-*`, `focus:*` (1755, 4029); no style key |
| focused field border, 2 px `#3b82f6` | none: `focus:border-*` recolours it, the width is forced (4020) |
| scroll bars | none (no `showsVerticalScrollIndicator`, no class) |
| placeholder colour | none (`placeholderTextColor` missing, docs/react-native.md:37) |
| selection colour | class `selection:bg-*` only (2221) |
| Pressable's dim under the react-native preset | none: React Native's Pressable shows nothing (`Press`, `lib/std/react-native.tsx:44-56`; the deviation is in docs/react-native.md:32) |

### 1.3 Reachable only through `className`

Checked by `zinc check` on `<View style={{ k: v }}>`: each of these is refused with "style 'k' needs a supported literal value (or is
unsupported)" or the message given, while the class works:

| React Native / CSS key | Class that works | Compiler message |
|---|---|---|
| `zIndex` | `z-10` | unsupported |
| `fontStyle: 'italic'` | `italic` | unsupported |
| `textDecorationLine` | `underline`, `line-through` | unsupported |
| `textTransform` | `uppercase` | unsupported |
| `textShadowColor/Offset/Radius` | `text-shadow-*` | unsupported |
| `color: '#ff000080'`, `borderColor: 'transparent'` | `text-white/50`, `border-transparent` | "alpha is only supported on backgroundColor" (`src/frontend/jsx.cpp:285`), "transparent borderColor is unsupported" (:264) |
| `fontWeight: '500'` | `font-medium` | accepted but mapped to normal: only bold/normal exist in a style (`jsx.cpp:161`) |
| `pointerEvents: 'none'` | `pointer-events-none` | unsupported |
| `cursor` | `cursor-pointer` | unsupported |
| `boxShadow`, Tailwind's `shadow-sm..xl` | `shadow-md` | unsupported (`shadowLevel` is in the PROP table, 1033, but not in the compiler's list, `jsx.cpp:149`) |
| `outline*` (the focus ring) | `outline-none`, `ring-2 ring-sky-500` | unsupported |
| `transition*` | `transition-colors duration-200` | unsupported (`animate()` is the code path) |

Also class-only, and fine to leave so (React Native has no style syntax for them either): state variants `hover: focus: active: disabled:
group-* peer-* aria-* data-*` (React Native uses Pressable's `style={({ pressed }) => ...}`, which zinc:react-native lacks), `dark:`, breakpoints
and container queries (React Native reads `useColorScheme` and `useWindowDimensions` in code, which Zinc has).

What style objects already cover, as React Native: flex, sizes, percentages, insets, margins, gaps, `backgroundColor` with alpha,
`borderWidth` and per side, `borderColor` and per side, `borderRadius` and per corner, `borderStyle`, `opacity`, the transform array (rotate,
scale, skew), `shadowColor/Offset/Opacity/Radius`, `elevation`, `backgroundImage` (gradients, `url()`), `resizeMode`, `tintColor`,
`fontSize/Family/Weight`, `lineHeight`, `letterSpacing`, `textAlign`, `numberOfLines` (PROP table 959-1035, `jsx.cpp:145-166`).

### 1.4 Reachable only through a kit

In the Solid model the core has no Switch, Slider, Modal/Dialog, Tooltip, Popover, DropdownMenu, toast, Tabs, Progress, ActivityIndicator,
MenuBar or ContextMenu: they are zinc:ui/kit (`lib/std/kit/index.ts`) or zinc:ui/nuxt, with their theme. The core has the mechanisms they are
built from (`ui.openLayer`, anchors, `VirtualList`, PanResponder, Animated, LayoutAnimation). React Native's core has Switch, Modal and
ActivityIndicator; Zinc gives them in the React model through zinc:react-native, with the platform look of D130. Shadows: the core never
draws one by default; the kit does (`shadow-sm` on Card, Stat, the default/outline/destructive Button, Tabs, Switch thumb: `lib/std/kit/card.tsx:29`,
`button.tsx:30-34`). docs/reports/zinc-next-perf.md:100 ("cards with shadows are the default look of zinc:ui") means the kit's look.

### 1.5 What a primitives-only program pays

Compiled code (`zinc --emit=zbc` / `--emit=cpp`; instruction lines of the ZBC listing), interpreter start = `zinc run --interp`, one headless
frame, median of 5:

| Program | Files | Functions | ZBC instructions | C++ | Start |
|---|---|---|---|---|---|
| docs/learn/samples/01-window-and-shape (zinc:gfx) | 3 | 13 | 1,228 | 70 KB | 69 ms |
| scratch `styleonly`: View, Text, a pressable View, style objects only | 12 | 274 | 71,174 | 3.08 MB | 348 ms |
| scratch `prims`: the bare primitives with classes, Input, TextArea | 12 | 267 | 69,756 | 3.02 MB | 351 ms |
| docs/learn/samples/12-a-small-app | 12 | 295 | 74,137 | 3.20 MB | 361 ms |
| scratch `prims-rn` (react-native preset, Pressable, Button, TextInput) | 19 | 370 | 79,116 | 3.50 MB | 436 ms |

The compile phases of `styleonly` (`-vv`): read and parse 56 ms, check 88, lower 58, optimise 95, reference counting 52, ZBC 42. The library is
compiled whatever the program uses: the style-only program still carries `applyToken` (4,909 instructions, the largest function), `editKey`
(2,202) and `paintEdit` (1,557). By area (function names grouped by regex, `styleonly`):

| Area | Instructions | Share | Used by `styleonly` |
|---|---|---|---|
| class tokens and CSS parsing (`applyToken`, `ringToken`, `imgToken`, `gradToken`, `stateToken`, `cssColor`...) | 11,221 | 15.8% | no |
| text fields (`editKey`, `paintEdit`, IME, selection handles, undo) | 9,082 | 12.8% | no |
| touch, gestures, scroll physics, wheel | 8,437 | 11.9% | partly |
| layout (classic) | 4,532 | 6.4% | yes |
| module init (palettes, colour maps, the PROP table) | 4,318 | 6.1% | yes |
| paint core | 3,327 | 4.7% | yes |
| layers, overlays, anchors, native views | 3,036 | 4.3% | no |
| gradients, background images, extended borders | 2,108 | 3.0% | no |
| transitions, animations, LayoutAnimation | 1,526 | 2.1% | no |
| accessibility tree, rn layout bridge, virtual lists | 3,299 | 4.6% | no |
| the rest (frame, input dispatch, writeProp, state overlays...) | 20,288 | 28.5% | mostly |

Why nothing is dropped: the class parser is reached from `rebuildStyle` (2620), which `setStyles`, scheme and media changes call for every
node, so the dead-code pass cannot prove it unused; the editor is reached from `frame`, `paint` and key dispatch whenever `n.ed !== null`.

Memory (`zinc mem`): a `UiNode` is 170 slots, **1,376 bytes** (16 + 170 x 8), plus its `children` array; the cold records (ring, border, snap,
interaction, gradient, image) are shared until written. `resetStyle` builds a whole `new UiNode(n.tag)` to read the defaults (2587-2588) at every
class rebuild, and a responsive or query token that does not match is applied to another throwaway node (2177, 2186). The 400-row scratch page:
808 `UiNode` allocations for 401 nodes, 1.1 MB allocated, 552 KB live.

Per frame: idle frames cost nothing (`gfx.keep`). The 400-row page with one text changing every frame: work p50 0.96 ms, layout 0.55 ms, paint
0.31 ms (`zinc bench`, interpreter). Default looks add no measurable paint work; shadows cost at raster time (PERF-04: 15.9 us per 60x40 blur-10
shadow, 78% of `b2-rounded`; 8.4 us after ZN-589 on this Mac), and ZN-774.20 takes that on.

## 2. React Native's model, and Zinc's react-native preset

React Native 0.87 (its docs through Context7): `View` is transparent and borderless; `Text` is the platform's default text (black, 14);
`Pressable` has **no** visual feedback: its `style` and `children` may be functions of `{ pressed }`, `android_ripple` is opt-in;
`TouchableOpacity` dims to 0.2; `TextInput` has no fill (no border on iOS, an underline on Android), and takes `placeholderTextColor` and
`selectionColor`; `ScrollView` shows indicators unless `showsVerticalScrollIndicator={false}`. Every visual property is a style key,
`StyleSheet.create` only names them; the New Architecture adds `boxShadow`, `filter`, `mixBlendMode`, `outline*`. React Native has no host
button: its `Button` is a component with a platform look; a design system is a library you add.

| React Native | Zinc today | Zinc after this report |
|---|---|---|
| View | View | View (unchanged) |
| Pressable | `<View onClick>` (dims) | the same (dims in the Solid/React model, documented); zinc:react-native's Pressable shows nothing |
| Text | Text (white, 16) | Text (black on a light window, white on a dark one; 16) |
| (HTML's `<button>`) | Button (slate fill, padding, centred) | Button: focusable, Enter/Space, role button, centres its content, draws nothing |
| TextInput | Input, TextArea (dark field) | Input, TextArea: caret, text and placeholder only, colour and size inherited |
| ScrollView | ScrollView | ScrollView, bars can be hidden |

What the react-native preset (`"ui": { "preset": "react-native" }`, `src/frontend/project.cpp:462`) already does differently: Text 14 px and
black (23, 2711), position relative by default with insets in the flow (3124, 3310), `flex: n` as React Native's shorthand (`jsx.cpp:219`),
React Native's imports, Yoga with `"layout": "rn"`, the Pressable/Touchable family, and Button, Switch, ActivityIndicator drawn per platform
(D130). What it still does not: Pressable dims, TextInput keeps the dark fill, a focused field draws a 2 px border, `borderColor` defaults to
grey-200 instead of black, and the keys of 1.3 are missing (docs/react-native.md:110-111).

## 3. Options (RULES.md §4)

Migration measured with the scratch root, frame 30, 44 offline UI projects plus the 19 UI rows of `tests/golden/examples/proto/manifest.json`
(projects that reach the network, a webview, processes or devices were left out: agents, carnet, chataigne, iot-panel, remote, rn-showcase,
webrtc, zed-editor and 14 more). Pixels that differ from the unpatched frame:

| Default removed | Programs that move |
|---|---|
| Button fill `#334155` | none |
| text white, made black everywhere | none |
| Button padding 4/8 | remarkable/dashboard 31,171 px (a proto row), pinball3d-editor 142 |
| Button centring | lessons 07 to 11 (325 to 4,714 px: the label moves to the top of `h-11` buttons), ui/figma-storyboard 1,312 |
| field fill, text colour, border, radius, size, padding | ui/forms 64,632 (proto), ui/keyboard 20,841 (proto), lesson 12 971, scripting/playground 4 (proto) |

Frame 30 shows each program's first screen only, so this is a lower bound. The upper bound is the files that use a host element: Button in
62 files (23 examples, 12 lesson files, 19 tests, 3 in lib, 2 templates, 2 app, 1 plugin), Input in 54, TextArea in 27. The kits move nothing:
kit Button and the nuxt controls set their own fill and size (`lib/std/kit/button.tsx:52`, `lib/std/nuxt/controls.tsx:99`), and kit-gallery,
nuxt-ui, hero, rn-tester and rn-port do not move under any patch.

- **A. Neutral primitives.** Button, Input, TextArea and the default text draw nothing a program did not ask for; the programs that relied on
  the old looks get them written out. Migration: the table above; pixel-identical if the classes are added before the defaults change.
- **B. A `preset` switch.** `"ui": { "preset": "neutral" }` beside today's look as the default. Nothing moves; but the default stays the heavy
  look the owner objects to, every primitive carries two branches, and the docs explain both.
- **C. Split zinc:ui** into a small module of primitives and a styled layer (classes, states, gradients, fields) as separate modules. The
  lightest result, but a refactor of 6,900 lines of shared core with module-private state on both sides, during which every UI demo is exposed.
- **D. Only add the missing style keys.** Freer, nothing moves; the slate Button and fields stay, the program is not lighter.
- **E. A + D + the light half of C:** neutral primitives behind a codemod that runs first; the missing keys; the class parser (and, if worth it,
  the field editor) compiled only into programs that use them, through a hook installed by `setClass`, not a module split.

| Criterion (weight) | A | B | C | D | E |
|---|---|---|---|---|---|
| fit with the goal (x3) | 4 | 2 | 3 | 2 | 5 |
| performance (x3) | 3 | 3 | 5 | 3 | 4 |
| size and footprint (x2) | 3 | 2 | 5 | 2 | 4 |
| maintainability (x2) | 4 | 2 | 2 | 4 | 4 |
| licence and supply (x2) | 5 | 5 | 5 | 5 | 5 |
| portability (x1) | 5 | 5 | 5 | 5 | 5 |
| effort (x1, 5 = least) | 4 | 3 | 1 | 3 | 2 |
| **total** | 54 | 41 | 54 | 45 | **60** |

## 4. Recommendation: E

What the primitives become:

- **View**: unchanged. A border without a colour stays grey-200 in the Solid/React model (the `border` class's colour), black under the
  react-native preset.
- **Text**: until a program gives a colour, black on a light window and white on a dark one (the luminance of `render`'s background; no
  background: white, as today); always black under the react-native preset. Measured: no program moves, and the beginner's white-on-light trap goes.
- **Button**: focusable, Enter and Space, role button, submits its form on the web, centres its content (layout, not look: the five lessons
  rely on it); no fill, no padding.
- **Input, TextArea**: no fill, no border, no radius, no padding; text colour and size inherited (React Native's TextInput, the page's
  `.zi { color: inherit; background: transparent }` already). Focus shows by the caret and, from the keyboard, the ring every control has; the
  2 px `#3b82f6` focus border stays only on a field that has a border, so every bordered field keeps its pixels.
- **Pressed dim**: stays in the Solid/React model (documented feedback, every kit relies on it, two ways out); zinc:react-native's Pressable
  shows nothing, as React Native's.
- **Focus ring, scroll bars, placeholder, selection**: stay (accessibility and React Native's own defaults), and each becomes a style key or
  prop as well as a class: `outline*`, `showsVerticalScrollIndicator`, `placeholderTextColor`, `selectionColor`.
- **Defaults are constants per tag**: `resetStyle` stops building a node to read them.

### Steps (one agent session each, in order)

1. **Codemod first, no pixel moves.** `zinc migrate ui-explicit-looks` (`src/lint/migrate.cpp`): in a static `className` literal of a host
   Button with no fill class, add `bg-slate-700`; with no `p`/`px`/`py`/`pl`/`pr`/`pt`/`pb` class, add the missing `px-2`/`py-1`; on a host Input
   or TextArea, add per missing family `bg-slate-800`, `border border-slate-600`, `rounded-md`, `text-[14px]`, `px-2 py-1.5`, and
   `text-slate-100` only when it also had no fill (a field with its own fill never wanted the light text: lesson 12). A dynamic `className` is
   listed for a hand fix. Run it with `--apply` over examples, templates, app, plugins, docs/learn (samples and fences) and tests. Proof:
   `tests/run --only migrate` (a before/after pair in tests/golden/migrate); the frame sweep of section 3 over every offline UI project and
   proto row gives 0 px (the defaults have not changed yet); `tools/style-neutrality` passes.
2. **Neutral primitives** (`lib/std/ui.ts` `defaults`, `resetStyle`, `textFg`, the field focus border; `targets/web/dom.js` field outline;
   `lib/std/react-native.tsx` drops `bare`). docs/ui.md gets a "What the primitives draw" section; CHANGELOG *Changed (breaking)* names the
   codemod. Proof: a new golden `tests/golden/ui-neutral` (bare View, Text, Button, Input, TextArea, `<View onClick>`: the scene dump holds
   their text and caret and no RECT or BORDER for them); `tools/style-neutrality` with the proto manifest untouched; the sweep at 0 px on the
   migrated projects; `tests/run --only ui ui-press ui-state ui-a11y react_native_input rn_text_defaults platform_look`; `zinc mem` on the
   400-row page: about 400 `UiNode` allocations instead of 808.
3. **Style keys, text and layering**: `zIndex`, `fontStyle`, `textDecorationLine/Color/Style`, `textTransform`, `textShadowColor/Offset/Radius`,
   `fontWeight` 100 to 900 onto the class weights, alpha and `transparent` on `color`, `borderColor`, `shadowColor`, `pointerEvents`, `cursor`,
   `shadowLevel` (or `boxShadow` reduced to one shadow). Each key writes the field its class writes. Proof: a golden `tests/golden/style-keys`
   where each key and its class render the same frame hash.
4. **Style keys, focus, fields, scrolling, motion**: `outlineWidth/Color/Offset/Style` (the focus ring), `placeholderTextColor`,
   `selectionColor`, `cursorColor`, `showsVerticalScrollIndicator`/`showsHorizontalScrollIndicator`, `transitionProperty/Duration/TimingFunction/Delay`
   onto the existing `InterX` record. Same proof, same golden.
5. **The react-native preset made exact**: Pressable with no dim, `style` and `children` as functions of `{ pressed }`, `borderColor` black by
   default; docs/react-native.md loses those deviations. Proof: `tests/t1/react_native*.sh`, the rn-tester frames; rn-port does not move.
6. **Lighter: classes only where used.** `rebuildStyle` calls the class parser through a function variable that `setClass` installs on first
   use; the compiler emits a `StyleC` instead of `Style` for a style object that lowers to `@` tokens (`backgroundImage`, `fontFamily`,
   `backgroundSize`...), whose constructor installs it too; zinc:react-native's one `setClass` (`lib/std/react-native.tsx:538`, sticky section
   headers) becomes keys from step 3. Proof: a T0 test that the ZBC of a style-only program has no `@applyToken`; the numbers of 1.5 measured
   again on a quiet machine (instructions, C++ bytes, interpreter start, `zinc build` seconds) and logged in docs/reports/zinc-next-perf.md
   (criterion 3); `tests/run --only ui ui-tokens style-border style-gradient style-image`.
7. **Lighter, part 2, if step 6's log shows it is worth a session**: the field editor (9.1k instructions, 12.8%) behind `_field` (the JSX
   lowering of `<Input>`/`<TextArea>`) and `ui.createField` (the three tests that call `createNode(ui.INPUT)` move to it). Same proof.

ZN-774.16 (the compiled std cache) removes most of the start time on a second run whatever happens here; steps 6 and 7 still shrink the first
compile, the AOT program and the code a board carries.

### Decision record (the coordinator numbers it)

| D? | What zinc:ui's primitives draw by default, and what a program that uses no classes compiles (ZN-774.18, owner 2026-10-22: "trop figé et trop lourd ... à la manière de react-native") | **The primitives draw nothing a program did not ask for, as React Native's: Button is a focusable box that centres its content (no fill, no padding); Input and TextArea show their text, caret and placeholder only (no fill, border, radius or padding; colour and size inherited; the 2 px focus border only on a field that has a border); Text is black on a light window, white on a dark one, black under the react-native preset. Kept: the pressed dim in the Solid/React model (zinc:react-native's Pressable shows none), the keyboard focus ring, the scroll bars, each now reachable as a style key too. A codemod, `zinc migrate ui-explicit-looks`, writes the old looks into the programs that relied on them before the defaults change, so no example or proto golden moves. Every class-only visual family gets a style key (zIndex, fontStyle, textDecorationLine, textTransform, text shadow, colour alpha, weights, pointerEvents, cursor, outline, placeholder and selection colours, scroll indicators, transitions). The class parser is compiled only into programs that use classes, through a hook `setClass` installs, not a module split.** | Scored E 60 (neutral + keys + hook), A 54, C (split the module) 54, D (keys only) 45, B (a preset switch) 41. Measured at frame 30 on 44 UI projects and 19 proto rows: the Button fill and the white text move nothing, the field look 4 programs, the Button's padding 2 and centring 6 (kept). A style-only program compiles 71k instructions of which 16% is the class parser and 13% the field editor; a node is 1,376 B and every class change allocated a second one. | A kit or a platform look needs a default the primitives no longer give, the codemod meets dynamic classes it cannot rewrite in user projects, or splitting the module becomes cheaper than the hooks. |

### Lines for backlog/later.md

- ZN-774.18: zinc:ui/kit has no Input or Textarea; kit apps style host fields by hand (shadcn's Input: h-9, rounded-md, border, px-3, text-sm).
- ZN-774.18: docs/ui-kit.md:63-67 and 100 write the props `class?` (banned spelling); docs/ui.md:817-818 contradicts the transform-array support above it.
- ZN-774.18: UiNode carries about 30 text-only fields on every node (1,376 B each); a cold text record like `BorderX` would shrink View, Button and Image nodes.
- ZN-774.18: the Solid model has no unstyled Switch, Modal or ActivityIndicator (React Native's core has them; zinc:react-native gives them only in the React model).
