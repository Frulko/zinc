# Layout engines for the Zinc UI: naive, Clay or Yoga

Date 2026-10-07. Scope: which flexbox engine `zinc:ui` uses per platform, given the owner's wish to port a React Native app and the tiny targets (ESP32, PS1, PS2, Pi1).
Inputs: `lib/std/ui.ts` `measure`/`place`/`layout` (read only, another developer's uncommitted work), `docs/reports/ui-rendering-architecture.md` 4.8, `docs/reports/ui-style-system.md` 5.3, `targets/capabilities.json`, `next/RULES.md` section 4.
Measurements were made on this Mac (Apple silicon, clang 17+, `-O2`) in a scratchpad clone; sources of the benchmark are not committed (reproduction notes in section 3).

## 1. Decision

1. **Pluggable layout behind one interface** (`zn::ui::Layout`, section 5). Two engines, chosen per project/profile: `classic` (the existing engine, fixed up, default everywhere) and `rn` (**Yoga 3.2.1 vendored**, opt-in, default for projects that declare `"ui": {"preset": "react-native"}`).
2. **Yoga is the RN-fidelity engine.** It is the engine of React Native itself, so "same semantics" is a property, not a goal; it has the exact RN defaults, a 548-case generated conformance suite taken from Chrome, a measure cache and dirty bits. It costs about 70 KB of code and 584 B per node (heap), so it is **never** the default on esp32, ps1, ps2.
3. **Clay is rejected.** It is not smaller (about 86 KB armv6 `-Os` against Yoga's 73 KB), has no wrap, margin, shrink, basis, align-self or min-content text rules, is pre-1.0 (v0.14, API changed in the checkout: `Clay_EndLayout(deltaTime)`), is immediate-mode (the tree is redeclared each frame, which fights Zinc's retained `UiNode` tree), and moves away from RN semantics rather than toward them.
4. This **revises** `ui-rendering-architecture.md` 4.8 ("do not adopt Taffy or Yoga"). That text rejected Yoga as the *only* engine because "every demo unchanged" (RULES 1) forbids changing pixels. Opt-in keeps that rule: the demos keep `classic`; Yoga is only used when asked. The SoA / measure-cache / relayout-boundary work (R5.1, ZN-189) stays, because `classic` must still be fast on tiny profiles. ST-05 (CSS flex completeness inside `classic`) shrinks to the cheap subset, see task LE-9: finishing it in full is rewriting Yoga.

## 2. Candidates

| | Naive (`ui.ts` measure/place) | Clay 0.14 | Yoga 3.2.1 |
|---|---|---|---|
| Licence | ours | zlib | MIT (Meta) |
| Language / deps | Zinc (typed TS) | C99 single header, 4.5k lines, no deps | C++20, 5.6k lines `.cpp`, 10.4k with headers, no deps, no exceptions/RTTI needed |
| Model | retained tree, full relayout when `layoutDirty` | immediate: tree redeclared every frame, emits render commands | retained tree, dirty bits, 8-entry per-node measure cache |
| RN semantics | partial and different in places (section 4) | none (own model: fit/grow/fixed/percent, no flex-wrap, no margin, no shrink rules, no align-self) | exact (it is RN's engine); `useWebDefaults` gives CSS defaults |
| Features | row/column, row wrap, grow (integer), gap, justify 6 modes, align 4, margins, abs position, percent size, scroll | padding, childGap, grow/fit/fixed/percent, min/max, floating, aspect ratio, scroll, text wrap | full flexbox, wrap/wrap-reverse, alignContent (incl. space-evenly), shrink/basis, min/max, percent, aspectRatio, gap (percent), absolute/static position, `display: none/contents`, `box-sizing`, RTL, baseline, rounding to the pixel grid, errata switches |
| Missing | shrink, basis, min/max, alignSelf, alignContent, reverse, column wrap, aspectRatio on boxes, auto margins, RTL | wrap, margins, per-item align, RN/CSS parity | grid, `min-width: auto` (same as RN), sticky |
| Text | `wrapText` in measure, measured at the parent's width (bug, section 4) | measure callback per word slice | measure callback `(w, mode, h, mode)` called with the final constraint |
| Size (aarch64 `-O2`) | 0 extra | 117 KB text incl. a `printf` main | 96 KB text |
| Size (armv6 `-Os`, Pi1) | 0 extra | 86 KB (text+data+bss) | 73 KB |
| Size (aarch64 `-Os`) | n/a | 78 KB | 68 KB; linked with `-dead_strip` the demo binary grew 70 KB over an empty one |
| RAM per node | about 600 B (`UiNode`, comment in `ui.ts`) | fixed arena: 5.8 MB at the default 8192 elements, 256 KB at 256 elements (`Clay_SetMaxElementCount`), about 1 KB per element incl. render commands | 584 B bare `YGNode` + 16 B child slot; 143 nodes = 91 KB heap in 612 allocations |
| Maintenance | us | one maintainer, pre-1.0, breaking changes between 0.x | Meta, React Native depends on it; last tag 3.2.1 is Dec 2024 (a slow, stable cadence) |
| FPU | `number` per profile (fx12 on PS1) | float | float (soft-float on PS1, slow; FPU on ESP32 f32, Pi1 VFP) |

## 3. Measurements

Tree: header row of 6 items, sidebar of 10 rows (icon + text), a wrapping content area of N cards (title text, wrapped body text, a row of 2 buttons with text), percent widths, padding, gap, grow, measure callbacks (7 px per character, 16 px lines). N=16 gives **175 nodes** (the hero page holds about 171). Fake text metrics, so only the layout engine is timed.

| Case (175 nodes, 1000 runs, ns timer) | Yoga 3.2.1 `-O2` arm64 | Clay `-O2` arm64 |
|---|---|---|
| Full relayout (root width changes every run, all caches miss) | **73 us** (143 nodes: 56 us) | 21 us at 256 max elements / 32 us at 8192 (**includes redeclaring the tree**; Clay has no wrap, the app lays cards in rows of 3 itself) |
| One leaf text marked dirty | **7 us** | not applicable (always a full frame) |
| Nothing dirty | **0.03 us** | not applicable |
| Heap after build + first layout | 143 nodes 91 KB / 612 allocs | arena 256 KB (256 elements) |
| `useWebDefaults` | no measurable difference (54 vs 56 us) | n/a |

Reading: both are far under a frame (16.7 ms) on a desktop; Yoga's incremental case (one text changed, 7 us) is the typical interaction, Clay re-pays 21-32 us every frame plus the declaration. On a Pi1 (about 30-50 times slower than this core by integer benchmarks, **estimate**) a full Yoga pass is 2-4 ms and an incremental one 0.3 ms: fine. On ESP32 (240 MHz LX6 with an FPU, **estimate** 60x slower) 4 ms full: fine for speed; the cost there is RAM: 175 nodes = 100 KB of a 160 KiB heap, and the `UiNode` tree already uses about 100 KiB (`ui.ts` comment), so Yoga **cannot coexist** with `classic`'s node store on ESP32. PS1 has no FPU: Yoga would run in software float (about 20-50x slower, **estimate**), not acceptable next to the fx12 profile.

**The naive engine was not measured.** It is Zinc code allocating arrays per container in `measure` (`const kids: UiNode[] = []`, `abs`) and running on the interpreter or AOT; there is no layout benchmark in `next/bench`. LE-2 adds one (section 7). Expect AOT to be within 2-5x of native Yoga for a full pass and always a full pass (no dirty bits), the interpreter far slower. This is the one number a decision should still check, but it does not change it: the engine is chosen for semantics and for the tiny profiles, not for desktop speed.

Reproduce: `git clone --depth 1 --branch v3.2.1 https://github.com/facebook/yoga`, compile `yoga/**/*.cpp` with `clang++ -std=c++20 -O2 -fno-exceptions -fno-rtti -I.`, and `size`; Clay at `e6cc369` with `-std=c99` and `CLAY_IMPLEMENTATION`. Yoga's own tests: `tests/generated` holds **548 tests** in 25 files generated by `gentest` from HTML fixtures run in Chrome, plus about 35 unit test files (measure cache, rounding, dirty marking, aspect ratio).

## 4. What `classic` does differently from React Native (from reading `measure`/`place`)

| # | Behaviour | `classic` today | React Native / Yoga |
|---|---|---|---|
| 1 | `flex: 1` | `grow 1` over the **content size** (basis auto); siblings with different content get unequal widths | `flexGrow 1, flexShrink 1, flexBasis 0`: equal shares |
| 2 | `flexShrink` | never shrinks, no property | default 0 in RN (so the default matches), but `flexShrink: 1` and `flex: 1` shrink; web defaults 1 |
| 3 | `min-width: auto` | no min/max at all (ST-04) | Yoga: no `auto` minimum either (same as RN), `minWidth/maxWidth` honoured |
| 4 | **Text wrapping in nested grow containers** (the bug the owner hit) | `measure` wraps the text at the width the parent offered *before* grow/stretch distribution; `place` then assigns the final width and sets `lw` but never re-wraps (`wrapText` is not called in `place`). The line count and height come from the wrong width: text overflows its box or leaves a gap | Yoga calls the measure function again with the **resolved** width and an `AtMost/Exactly` mode, and the cache keys on it. Fixed at the root |
| 5 | Margin collapsing | none | none (same) |
| 6 | `aspectRatio` | images only | any node, Yoga resolves against the other axis |
| 7 | `alignContent` | missing (wrap lines are content-sized, like flex-start) | default flex-start in RN, all six values |
| 8 | Wrap | rows only; no `wrap-reverse`, no column wrap | both axes and reverse |
| 9 | Reverse directions, `alignSelf`, `flexBasis`, auto margins | missing | present |
| 10 | Percent | `wFrac * maxW` where `maxH` of an auto-height parent is the remaining viewport | percent of the parent's inner size, undefined for auto parents |
| 11 | Rounding | `Math.round` of x and y; `lw`/`lh` are not edge-snapped; grow share is `floor(free*g/grows)` and the remainder pixels are lost | positions rounded, size = `round(x+w) - round(x)`, so neighbours always touch; remainder distributed before rounding (`YGPixelGrid.cpp`) |
| 12 | Border in layout | paint only (ST-08) | `borderWidth` takes layout space |
| 13 | Grow with `justify` | `justify` applies only when no child grows (equivalent) | same |
| 14 | Direction | LTR only | `direction: rtl`, start/end edges |
| 15 | Absolute | `left/right/top/bottom` against the node box, default top-left of padding box | same model (parent padding box), plus percent and `position: static` |
| 16 | `display` | `hidden`, fragment | `none`, `flex`, `contents` |

Items 1, 4, 6, 7-9, 11, 12 change pixels when fixed, which is why they cannot be fixed inside `classic` without violating "all demos unchanged". Item 4 is the exception: it is a bug; fixing it (re-wrap in `place` when the final width differs) belongs in `classic` (LE-8) and is checked against the demo goldens.

## 5. Integration design

**Interface** (`src/host/layout.h`, one header, owned by us, dependency direction as `host`): 

```
create(node) / destroy(node)
set_style(node, key, value)      // key ids = the PROP table of ui-style-system 5.2 (layout class only)
insert(parent, child, index) / remove(parent, child)
set_measure(node, kind, text_id, font_id, size_x64, tracking)   // native text metrics, no VM re-entry
mark_dirty(node)
calculate(root, w, h)
box(node) -> {x, y, w, h}        // relative to parent, already rounded
```
`classic` is the existing Zinc code behind the same calls (no behaviour change; it reads nodes directly). `rn` is `src/host/layout_yoga.cpp` (about 400 lines) over `third_party/yoga`.

**Vendoring.** `third_party/yoga/`: `yoga/` sources of tag **v3.2.1** (commit 042f501), `LICENSE`, archive sha256 recorded in `third_party/README.md`, built by our CMake as the static library `zn_yoga` with `-fno-exceptions -fno-rtti`, no Java/JS/Gradle, no `capture`/`fuzz`. Builds with clang and `zig c++` (verified with both targets above). Only the unit tests of the layout core are kept for the conformance job.

**Mapping `UiNode` to `YGNode`.** Created lazily in `rn` mode at node creation, kept in a handle-indexed table (SoA friendly; `UiNode` gets no new field).

| UiNode | YGNode |
|---|---|
| `row`, `wrap` | `flexDirection`, `flexWrap` |
| `justify` 0..5, `align` 0..3 | `justifyContent` (start, center, end, space-between, space-around, space-evenly), `alignItems` (flex-start, center, flex-end, stretch) |
| `grow`, `fullW/fullH` | `flexGrow`; `w-full` = `width: 100%` in `rn` mode (CSS-like, not "grow 1") |
| `pt/pr/pb/pl`, `ml/mr/mt/mb`, `gap` | `padding`, `margin`, `gap` |
| `w/h`, `wFrac/hFrac` | `width/height` (points, percent) |
| `left/right/top/bottom` != UNSET | `positionType absolute` + insets |
| `scroll` | `overflow: scroll`; content size read back with `YGNodeLayoutGetHadOverflow` / child extents |
| `hidden` | `display: none`; `FRAGMENT` = `display: contents` |
| `lx` side record (min/max, basis, shrink, order, alignSelf, aspectRatio) | the same Yoga properties; `order` stays in Zinc (stable sort of children before `insert`) |
| TEXT, IMAGE, `ed` (text field) | measure function (below) |

Implemented in `next/src/host/layout_yoga.cpp` (ZN-283): `setStyle` takes the PROP numbers of `lib/std/ui.ts` for the layout class and numbers from 1000 for the side-record fields that have none yet (`zn::host::LayoutProp` documents the value encodings); `tests/t0/layout_yoga.sh` checks one case per row, the rounding, and the heap after 1000 create/destroy cycles. The measure callbacks are ZN-284.

**Text.** The measure callback is C++: it reads `(text_id, font_id, size, tracking)` from the wrapper's node record and calls the runtime's `text_advance`/`textWidth` and the existing wrap routine (the same code as `wrapText`; later the HarfBuzz tier of ZN-114 through `TextLayout`). It returns `{width, lines * lineHeight}`. No callback into the VM, so it works in the interpreter, the AOT and QuickJS modes. After `calculate`, `ui.ts` re-runs `wrapText` for each text node with its final width (pure, cached by `(text, font, width)`) to fill `lines[]`/`lineW[]` for the painter; this also makes `rn` and `classic` agree on the lines of a given box.

**Images and fields.** Image measure = intrinsic size and `aspectRatio` from the image; text fields use the 200 px default of `classic` unless the style gives a width.

**Scroll views, layers, anchors.** Unchanged: `layoutLayers()` and `applyAnchors()` run after `calculate` and only consume `x, y, lw, lh`; `box()` is converted to absolute coordinates by summing parents once (a pass over the tree, no allocation). Virtual lists keep `contentH = count*itemH` and give Yoga the viewport as a fixed-size scroll node whose realised rows are children.

**Dirty flags.** A layout-class property write (`PROP` table class `layout`) or a text change calls `mark_dirty(node)` (Yoga propagates to ancestors and stops at a node whose result is cached); `layoutDirty` stays the global request to run `calculate`. Paint-only writes (colour, opacity, transform) never touch the engine. A node with fixed width and height is a relayout boundary in Yoga for free.

**AOT / ZBC path.** Layout lives in the host (`zn::host`, like `Gfx`), reached through the runtime-call table, so ZBC needs a handful of new runtime calls (`layout_create/set/insert/remove/dirty/calculate/box`), not new opcodes; the AOT output links `zn_yoga` only when the project selects `rn`. The compiler resolves the option at build time and drops the module otherwise (the `zinc:ui/fx` pattern of ui-style-system 5.2: an ESP32 app ships none of it). Where the wrapper cannot be linked (a firmware without C++ exceptions-free libstdc++ support, PS1) the build refuses `rn` with a clear diagnostic.

**Selection.** `zinc.json`: `"ui": {"layout": "classic" | "rn" | "auto"}` and `"preset": "react-native"` (sets `layout: rn`, RN style defaults, `useWebDefaults` off, `Errata` none). `auto` reads `targets/capabilities.json` key `ui.layout`:

| Profile | default | `rn` allowed |
|---|---|---|
| macos, linux, rmpp, wasm | classic | yes (wasm: about 60-70 KB more download) |
| rpi1 and up | classic | yes (VFP, 64 MiB) |
| ps2 | classic | yes in principle (16 MiB, f32), untested: LE-12 |
| esp32 | classic | no (RAM), diagnostic |
| ps1 | classic | no (soft float, 256 KiB heap) |

Implemented in ZN-285: `"ui": {"layout", "preset"}` in zinc.json, the `ui` group of `targets/capabilities.json` (`layout` for `auto`, `rn` allowed or not, `why`), resolved at compile time for the profile or the `--target`; programs read the result as `UI_LAYOUT` of `zinc:platform`. `tests/t0/ui_layout_option.sh`.

An RN app on a tiny target uses `classic`: the RN-only styles it relies on (flex 1 equal shares, shrink, aspectRatio, alignContent) must then be handled by LE-9, or the app is not a candidate for that target. This is stated in the docs, not hidden.

## 6. Scores (RULES section 4: fit x3, performance x3, size x2, maintainability x2, licence x2, portability x1, effort x1; maximum 70)

| Option | Fit | Perf | Size | Maint | Licence | Port | Effort | Total |
|---|---|---|---|---|---|---|---|---|
| A. Naive only (improve in place) | 2 | 2 | 5 | 2 | 5 | 5 | 5 | **46** |
| B. Clay | 1 | 4 | 3 | 2 | 4 | 4 | 2 | **39** |
| C. Yoga only (replace naive) | 4 | 4 | 3 | 5 | 5 | 4 | 3 | **57** |
| D. Pluggable: naive default (tiny and demos), Yoga opt-in `rn` | 5 | 4 | 4 | 4 | 5 | 4 | 2 | **60** |

Fit: A 2 (does not meet RN semantics, and extending it fully is a Yoga rewrite), B 1, C 4 (loses "demos unchanged" and the tiny targets), D 5. Perf: naive has no dirty bits and allocates (2); Yoga and Clay are microseconds. Size: D counts Yoga as optional, so tiny builds pay 0. Effort: D has the interface plus the wrapper plus the conformance work.

D wins by 3 over C and 14 over A; C would win if the tiny targets were out of scope, which they are not (RULES 1, product vision).

**What would make us revisit**: the naive engine measuring within 2x of Yoga and growing real RN fidelity cheaply (LE-9 turns out small: drop `rn`); Yoga's 7 us incremental advantage mattering on Pi1 (it will not); a Yoga release that drops the C++20 / no-RTTI build; Taffy-in-C++ getting a licence (grid).

## 7. Conformance plan

1. **Fixture corpus (JSON).** A script (`tools/layout-fixtures`, Node, run offline, outputs committed) extracts every case of Yoga's `tests/generated/*.cpp` (548) into `{name, tree: {style..., children, text}, viewport, expected: [{x, y, w, h}]}`. Expectations come from Chrome (that is how Yoga's tests are generated), so they are CSS-correct, which is what `rn` with web defaults must match; the RN-default variants are produced by running Yoga itself with RN defaults (golden of the engine, reviewed once).
2. **Zinc layout runner** (`tests/t0/layout_conformance`): feeds each fixture to an engine through the section 5 interface and compares boxes with tolerance 0 (`rn`) or reports (`classic`). Output is a matrix `feature x engine` (pass count), committed as `docs/reports/layout-conformance.md`.
3. **`rn` must pass 100%** of the generated cases (they are Yoga's own tests: a failure means a wrapper bug in mapping or text measure); a handful of RN-specific cases (flex 1 equal shares, percent, `w-full`, rounding, nested text wrap) are added by hand.
4. **`classic` is tracked, not required**: the known-fail list (section 4) must only shrink; LE-8 and LE-9 each move named cases from fail to pass. A random-tree differential (10k trees, the harness of ZN-189 / S10) compares `classic` before/after any change to prove "zero diffs on the 63 example entries".
5. **Pixel goldens for the examples.** Every example entry renders twice: `classic` (the existing goldens, unchanged) and, for the ones that make sense (hero, maps, bouncing-ball HUD, remarkable), `rn`, recorded as separate goldens with a reviewed diff image where they differ. The diff list is the migration guide for RN users.
6. **Perf gate.** `tools/bench-m4`-style benchmark `layout-175` (the tree of section 3, built through the interface): full, one-leaf, clean; `--check-regressions` at 15% per RULES 7; a size job prints `size` of the `zn_yoga` object per target (armv6, aarch64, wasm32) and fails above 90 KB.

## 8. Proposed backlog tasks

Sizes S (under half a session), M (one session), L (two). None created; this is the proposal. Ids are placeholders.

| ID | Title | Size | Depends on | Acceptance criteria |
|---|---|---|---|---|
| LE-1 | Vendor Yoga 3.2.1 as `zn_yoga` | S | none | 1. `third_party/yoga` holds v3.2.1 sources, `LICENSE`, row in `third_party/README.md` with commit and sha256. 2. Builds warning-free with clang and `zig c++` for macos, linux and `arm-linux-musleabihf -mcpu=arm1176jzf_s`. 3. T0 test links it and computes a 2-node row layout (80+80 px in 100 px, shrink 0 and web defaults 1) with the expected boxes. |
| LE-2 | Layout benchmark `layout-175` and size job | S | none | 1. `bench` entry builds the 175-node tree through a minimal tree API, runs full, one-leaf and clean cases for Yoga and, when present, for `classic` (via a headless `ui.layout()` run). 2. Numbers (including the so-far unmeasured `classic` AOT and interpreter times) are written to the task notes and `--check-regressions` works. 3. `size` of `zn_yoga` for 3 targets printed; fails above 90 KB. |
| LE-3 | `zn::ui::Layout` interface and `classic` adapter | M | none | 1. `src/host/layout.h` with the calls of section 5; `classic` implements it with the current code, no behaviour change. 2. All example pixel goldens identical (tolerance 0) on interpreter and AOT. 3. `measure()` allocation count not higher (ZN-189 counter). |
| LE-4 | Yoga wrapper: style mapping, tree ops, boxes | M | LE-1, LE-3 | 1. Every `UiNode` field of the section 5 table maps to a Yoga call (unit test per row). 2. `box()` returns parent-relative rounded boxes, and absolute conversion matches Yoga's `YGNodeLayoutGetLeft` sums. 3. Destroying nodes frees all Yoga memory (ASan/UBSan clean, heap equal before/after 1000 create/destroy cycles). |
| LE-5 | Native text, image and field measure callbacks | M | LE-4 | 1. A text node in a `flex: 1` row inside a `flex: 1` column wraps at its **final** width (the owner's bug case) in `rn` mode: line count and height equal a hand-computed fixture. 2. Callback makes no VM re-entry (same result in interpreter, AOT and `--engine quickjs`). 3. `lines[]` after `calculate` equals `wrapText` at the final width for 100 random strings. |
| LE-6 | Option and selection: `ui.layout` in `zinc.json`, capabilities key, build-time inclusion | S | LE-3, LE-4 | 1. `"ui": {"layout": "rn"}` selects Yoga; `classic` default; `auto` follows `targets/capabilities.json` `ui.layout`. 2. `rn` on esp32 or ps1 fails the build with a diagnostic naming the reason. 3. A `classic` ESP32 build contains no Yoga symbol (`nm` check in a T0 test). |
| LE-7 | Dirty flags and per-frame integration (`rn`) | M | LE-4, LE-6 | 1. Changing a text marks only that node and ancestors dirty; a paint-only change (opacity) causes zero `calculate` work (counter). 2. Scroll views, `layoutLayers` and `applyAnchors` give identical results to `classic` on the layers/anchors tests of `docs/ui.md`. 3. The hero page renders in `rn` mode with no crash and a recorded golden. |
| LE-8 | Fix re-wrap of text at the final width in `classic` | S | LE-3 | 1. A regression test (grow containers nested two deep, text longer than the free width) fails before and passes after: lines fit the box. 2. All example goldens unchanged except entries listed and reviewed in the notes. 3. No extra allocation in `place` (counter). |
| LE-9 | `classic` RN-compat subset, opt-in via `"preset": "react-native"` or tokens | L | LE-3, ST-02 | 1. `flex: 1` equal shares (basis 0), `flexShrink`, `minWidth/maxWidth`, `alignSelf`, `aspectRatio` available as opt-in props; with none set the legacy loop runs unchanged (goldens tol 0). 2. These cases pass in the conformance runner for `classic`. 3. `size` growth of `classic` documented, under 6 KB of ZBC on the esp32 profile. Replaces ST-05's remaining scope. |
| LE-10 | Conformance corpus: Yoga cases to JSON and the runner | M | LE-3, LE-4 | 1. 548 generated cases extracted to JSON by a script (committed with the script and Yoga tag). 2. `rn` passes 100% with tolerance 0; the runner prints a feature x engine matrix into `docs/reports/layout-conformance.md`. 3. `classic` pass count recorded as the baseline and the known-fail list checked in; CI fails if a previously passing case regresses. |
| LE-11 | RN example port spike: one React Native screen on Zinc in `rn` mode | M | LE-5, LE-7 | 1. A real RN screen (FlatList, nested flex, percent, absolute badge, text wrapping) from the owner's app (or a public RN sample if not shared) runs unchanged apart from imports. 2. Pixel golden recorded; a diff list of what differs from the device screenshot is written. 3. Gaps become backlog tasks (each with a fixture). |
| LE-12 | Profile matrix: wasm, rpi1, ps2 and fallback decision | S | LE-6 | 1. `rn` builds and runs the `layout-175` test on wasm (size printed), rpi1 (Pi test rig or its emulation) and ps2 (PCSX2/emulator) or is marked unsupported with the measured reason. 2. `targets/capabilities.json` `ui.layout.rn` values updated from the measurement. 3. `docs/ui.md` has a "Layout modes" page with the section 4 differences table. |

Order: LE-1 and LE-2 and LE-3 (parallel), LE-8 early (a bug fix users hit today), then LE-4, LE-5, LE-6, LE-7, LE-10, LE-11, LE-9 and LE-12 last.
