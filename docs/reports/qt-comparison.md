# Zinc vs Qt 6 / Qt Quick: comparison and adoption plan

Analysis, 2026-09-28. The Qt sources are listed at the end.

## Where Zinc stands

**Rendering today:**
- `frame()` in `ui.ts` repaints the whole tree when anything is dirty and emits a new command list.
- `gfx.end_frame` diffs that list against the previous one into at most 8 damage rectangles.
- The damaged rows are rasterized in parallel bands.
- Idle frames cost nothing.
- Layout is whole-tree, and reactivity is Solid signals or React hooks over an imperative engine API.

**What Qt does differently:** a retained `QQuickItem` → `QSGNode` tree (only changed items update), a render thread with a blocking sync, and batched GPU rendering through RHI.

| Area | Zinc | Qt 6 / Qt Quick | Verdict |
|---|---|---|---|
| Rendering | retained command list, list diff → ≤8 damage rects, software AA raster, same pixels everywhere | retained scene graph with per-item dirty state, batched GPU (RHI), software adaptation | Qt ahead on per-node retention and GPU composition; Zinc ahead on determinism and running without a GPU |
| Threading | one logic thread, raster bands fork/join | GUI thread + render thread (blocking sync) | Qt ahead on hosts; Zinc simpler, better on single-core MCUs |
| Reactivity | Solid signals compiled from JSX, React hooks | QML bindings, `QProperty` lazy bindings, loop detection, needs a QML engine | comparable; Zinc cheaper (AOT, no VM, no GC); Qt ahead on lazy evaluation and loop diagnostics |
| Layout | flexbox + absolute, whole-tree relayout | anchors, positioners, Layouts (min/max, spans) | Qt ahead (min/max, grid, incremental); Zinc simpler (one model) |
| Animation | `animate()` on the logic thread | Behaviors, States / Transitions, render-thread Animators | Qt ahead |
| Lists | fixed-height virtualization, no reuse | ListView / TableView / TreeView, `reuseItems` pool, `fetchMore`, model roles | Qt clearly ahead |
| Input | DOM-like events and capture, best-in-class scroll physics, deterministic hooks | Pointer Handlers, passive / exclusive grabs, multitouch, `canceled` | Qt ahead on arbitration and touch; Zinc ahead on scroll feel and testability |
| Focus / keys | flat Tab order, global `onKey` | FocusScope, `activeFocus`, KeyNavigation, Shortcut contexts | Qt ahead (kit-v2 plans scopes and keymaps) |
| Text | own TTF parser, bitmaps, Latin-centric (no kerning, bidi, fallback, IME preedit) | HarfBuzz, OpenType features, distance fields, rich text, input methods | Qt far ahead |
| Accessibility | none | Accessible attached property + platform bridges | Qt far ahead (**a blocker for iOS / the EU**) |
| i18n | none | qsTr, plurals, lupdate / Linguist, live switch, LayoutMirroring | Qt far ahead |
| Styling | Tailwind tokens + CSS, kit theme signal | templates + 8 styles | comparable, Zinc lighter |
| Tooling | CDP inspector, hot reload, red box, **byte-exact sim oracle, pixel goldens, replay tapes**, Studio | Creator, qmlls, QML Profiler, GammaRay, `QSG_VISUALIZE`, Design Studio, Squish (commercial) | Qt ahead on profiling; Zinc ahead on deterministic cross-target tests |
| MCU | one compiler / language / UI from ESP32 (160 KiB heap) to Retina | Qt for MCUs: a separate commercial QML subset | Zinc ahead |
| Size / memory / startup | hello 53–70 KiB, ~0.5 KiB per node, 3.8 ms startup | megabytes (estimate), a QObject per item, JS heap + GC | Zinc far ahead |

**Keep as is:**
- AOT TS → C++ with no VM (Qt only gets there with qmltc / qmlsc / MCUs);
- pixel identity, the oracle and tapes;
- tiny binaries, no GC, one stack for every target;
- the scroll physics.

## Principles to adopt

Effort: S ≈ 1–2 weeks, M ≈ 3–6 weeks, L > 6 weeks. Priority P1 is the highest.

1. **Profiler and visualizer first (S, P1).**
   - Per-phase frame timings: input, animations, effects, layout, emit, diff, raster per band, present.
   - Export them as a CDP `Tracing` timeline, so Chrome's Performance panel shows them.
   - `ZINC_VISUALIZE=damage|cmds|layers` overlays.
   - Warn when the draw-command pool overflows (today commands are dropped silently).
   - Frame budgets in `zinc test --bench`.
2. **Retained paint (M, P1).**
   - Per-node `paintDirty` and a retained command range; re-emit only dirty subtrees, and compute damage from their old and new bounds.
   - **Copy-scroll:** a new `SCROLL_BLIT` command moves the viewport rows with `memmove` and rasterizes only the exposed strip.
   - Incremental layout: a per-node measure cache and per-subtree `layoutDirty`.
   - Same rasterizer, so the pixels stay identical.
3. **Render pipeline thread (M, P2).**
   - The command list is already an immutable double-buffered snapshot, so the "sync" is a pointer swap.
   - Frame N+1's logic runs while frame N rasterizes.
   - Opt-in (`"pipeline": "auto"`) on 2+ cores; off while typing or touching, and never on ESP32 / PS1.
4. **Animators and implicit transitions (M, P2).**
   - transform / opacity animations run on cached layers at composition time, so the logic thread and layout are not involved.
   - `transition-transform duration-200` class tokens act as Behaviors.
   - `ui.spring(h, key, to, {stiffness, damping})` reuses the ScrollAxis spring.
5. **GPU composition layers (L, P2).**
   - Content stays software-rasterized; the framebuffer, cached layers, scroll tiles and video / map / 3D layers are composited on the GPU: Metal on macOS / iOS, GLES2 on the Pi (from display-gl).
   - Integer transforms + opacity keep the goldens byte-exact.
6. **Engine-level bindings (S–M, P3).**
   - `ui.bindNumber / bindClass / bindText`, shared by Solid, React and the kit, flushed right before layout (batching).
   - Lazy memos and a dev-build binding-loop detector.
   - Compile-time property ids instead of string keys.
7. **Delegate recycling and typed models (M, P1).**
   - `virtualize` gains `heightOf(i)` (prefix sums), `kindOf(i)` and `reuse(row, i)`: zero allocations while scrolling.
   - A typed `ListModel<T>` (count, get, onChange, fetchMore): fields instead of QVariant roles.
   - Tables with shared horizontal scroll.
8. **Pointer handlers and gesture arbitration (M, P1 for touch).**
   - Passive, then exclusive grabs past the drag slop, with `onPointerCancel` for the loser.
   - `onTap / onLongPress / onDrag / onPinch` attributes.
   - Multitouch in the tree, and `ui.touchAt` for deterministic multi-finger tests.
9. **Focus scopes and key contexts (S, P1).**
   - `ui.focusScope(h, {trap, restore, autoFocus})`, `focus-within:`, keymaps by context, `ui.keysFor(action)`.
10. **Text (L, P2; P1 if non-Latin markets matter).**
    - Tier A: kerning, a baked fallback chain, UAX#9 bidi, cached glyph runs.
    - Tier B: a HarfBuzz `zinc:shaping` plugin on hosts, and build-time shaping of static strings for MCUs.
    - IME preedit.
    - No distance fields.
11. **Accessibility (L, P1 for iOS / EU).**
    - An optional `a11y` record per node (role, label, states, value) with default roles from tags; kit components set their own.
    - `ui.a11yDump()` in conformance goldens.
    - HAL bridges: NSAccessibility, UIAccessibility, AT-SPI. Consider AccessKit.
12. **i18n (M, P2).**
    - `t()` / `tn()` in `zinc:i18n`, and `zinc i18n extract` through the compiler AST to XLIFF / PO.
    - Compiled catalogs, CLDR plurals per included locale.
    - The locale as a signal.
    - `dir="rtl"` with logical tokens (`ps-*`, `ms-*`, `text-start`).
13. **Style system (S, P3).**
    - Behaviour / style split (kit-v2).
    - Compile-time theme tokens through `@theme`.
    - A state matrix: one kit with several themes, not 8 styles.
14. **Compiled declarative UI (M, P3).**
    - Static subtrees become templates instantiated at once.
    - qmllint-style diagnostics: unknown class tokens, a non-accessor passed where an accessor is expected.
    - Keep JSX.

## What not to copy

- The meta-object system, QVariant, and string-keyed properties and roles. Remove Zinc's own string-keyed `setNumber` too.
- Several languages with an engine and a GC.
- Binding loops (detect them in dev only).
- A blocking GUI ↔ render sync on tiny devices.
- Several conflicting layout systems: keep flexbox + absolute, add min / max and maybe grid.
- Distance-field text and GPU-only effects that break the software path.
- Runtime style selection and deployment scanners.
- Clip-heavy delegates.
- Licence splits: keep every feature in one licence, with permissive dependencies only.

## Roadmap (merged with kit-v2)

| Phase | Content | Measurable goals |
|---|---|---|
| 0 measure (2–3 weeks) | profiler, bench scenes | p50 / p99 frame phases recorded in CI; hello ≤ 75 KiB; startup ≤ 5 ms |
| 1 interaction (5–7 weeks) | grabs and gestures, focus scopes and keymaps, kit-v2 engine items 1–4 | overlays open in ≤ 1 frame; Solid and React outputs identical; hello size change ≤ +3 KiB |
| 2 retained engine and lists (6–8 weeks) | per-node damage, copy-scroll, incremental layout, VirtualList v2 / Table | caret blink ≤ 50 commands and < 0.3 ms; 10k variable-height rows at 120 fps p99; 0 allocations while scrolling; 1000 rows ≤ 40 KiB on ESP32 |
| 3 pipeline, animators, compositor (8–10 weeks) | render thread, layers, Metal / GLES2 | hero at 120 Hz p99 ≤ 8.3 ms; iOS at 3× 60 Hz; 60 fps animations while logic blocks 100 ms; goldens identical with the compositor on and off |
| 4 text and i18n (8–12 weeks) | kerning / bidi / fallback, HarfBuzz plugin, `zinc:i18n` | glyph runs equal to hb-shape on an Arabic / Hebrew / Devanagari / CJK corpus; correct RTL golden; no cost when unused; IME preedit |
| 5 accessibility (8–10 weeks, in parallel with 4) | a11y tree, macOS / iOS / AT-SPI | VoiceOver reaches every kit component; a11y dumps in conformance; 8 bytes per node when unused |
| 6 polish | bindings, themes, templates, devtools panes | no string-keyed calls in generated C++; lint for unknown classes |

If shipping on iOS or in the EU is the near-term goal, move phase 5 before phase 3: VoiceOver is the one gap that blocks shipping.

## Sources

- **Scene graph:**
  - doc.qt.io/qt-6/qtquick-visualcanvas-scenegraph.html
  - qtquick-visualcanvas-scenegraph-renderer.html
  - qtquick-visualcanvas-adaptations(-software).html
- **Bindings and the compiler:** qproperty.html, the "property bindings in Qt 6" blog post, qtqml-syntax-propertybinding.html, qtqml-qml-type-compiler.html, qtqml-qtquick-compiler-tech.html
- **Layout and animation:** anchors, layouts overview, animations, Animator, Behavior
- **Lists and models:** ListView, TableView, C++ models
- **Input and focus:** Pointer Handlers, focus, Shortcut
- **Text and input methods:** Text, the Qt 6.7 text improvements blog post, QInputMethod
- **Accessibility and i18n:** accessible-qtquick.html, accessible.html, internationalization, Linguist, right-to-left
- **Styles:** Controls styles and customization
- **Performance and deployment:** qtquick-performance.html, deployment
- **Qt for MCUs:** overview, known issues, memory optimization; the binary size blog post
- **Tooling:** qmlls, QML Profiler, GammaRay, Qt Quick Test, Squish, Design Studio
- **Licensing:** LGPL obligations
