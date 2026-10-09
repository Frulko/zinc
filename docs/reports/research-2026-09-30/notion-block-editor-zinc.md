# A Zinc-native Notion-style block editor: assessment, options, plan (2026-09-30)

Status: research only, nothing implemented. Tags: **[verified]** read in the code/docs or measured here, **[web]** from a
fetched/searched source (URL at the end), **[inferred]** my reasoning, not checked by running anything. Estimates are one
strong developer, unvalidated. Zinc tree was dirty when read; refs are to the working tree of 2026-09-30.
Paths: `NBE` = `/Users/mowmow/Lab/notion-block-editor`, `ZINC` = `/Users/mowmow/Lab/zinc`.

## 0. Bottom line

1. `notion-block-editor` is **Carnet**: an MIT, vanilla-TypeScript (no React/ProseMirror/Lexical/Slate) Notion-class block
   editor whose document model is **already headless and DOM-free**, and already ported twice (Swift, Rust/GPUI) with
   parity tests. That is the best possible starting point for a Zinc port. **[verified]**
2. The hard part is not the model, it is **Zinc's text engine**: a `text` node has one style, there are no inline spans,
   no IME preedit, no rich clipboard, no shaping/bidi/emoji. Those gaps (section 4) are shared with the code-editor
   study and must land first. **[verified]**
3. Recommendation: **option (i), made dual-target**: keep Carnet's headless core as TypeScript, make it compile under
   Zinc (subset lint in CI, kept green in both `tsc` and `zinc check`), and write a new Zinc view + input layer over a
   shared rich-text engine. Do not run the browser bundle on QuickJS (option ii). Option (iii) is (i) with more typing.

## 1. Assessment of the project as it is

### 1.1 What it is [verified]

- `NBE/README.md:1-40`: "Carnet", "a Notion-class block editor written in vanilla TypeScript, with storage you can read
  without it: Markdown files in a folder". Packages published as `@nbe/*`, CLI `nbe`. MIT (`NBE/LICENSE`), author Guillaume
  Dumoulin (same author as Zinc).
- Git: 357 commits, 2026-08-06 to 2026-08-13 (one week, heavy Claude Code assistance, stated openly at `README.md` "How this
  was built"). Current branch `rewrite/v2` (dirty), `main` = v1. 913 tracked files.
- Two generations side by side:
  - **v1** `packages/core` (4.4k lines TS, zero DOM) + `packages/dom` (15.4k) + `react|vue|svelte` mounts (~75 lines each) +
    `blocks-*` plugins + `workspace`, `collab` (Loro), `cli`, `markdown`, `static-renderer`.
  - **v2** `packages/carnet` (25.3k lines TS incl. views, plugins, 5 locales, database block): "a block editor you compose,
    every block is a plugin". `NBE/docs/design/v2-status.md:1-60`: 216 unit + 22 browser tests at that snapshot;
    v1 claims ~1040 unit tests and 6 gating suites (`README.md`, `docs/NEXT.md:1-20`: 1012 unit, Chromium 189/189,
    WebKit 178/178, single-host 184/184, touch, Swift 75).
- Also present: `native/swift` (document + CRDT, 75 tests), `native/gpui` (Rust + GPUI, no webview, ~6.5k lines Rust,
  44 tests, `native/gpui/README.md`), `apps/desktop` (Tauri), `apps/ios` (SwiftUI), `apps/obsidian`, `site` (Astro).
  Parity tests fail a commit if the autoformat tables drift between TS, Swift and Rust (`test/swift-parity.test.ts`,
  `test/gpui-parity.test.ts`).

### 1.2 Data model [verified]

`NBE/packages/carnet/src/model/types.ts`, `ops.ts`, `richtext.ts`, `marks.ts`, `doc.ts`:

- **Flat block map**: `Block { id (UUIDv7), type, version, props: Record<string, unknown>, text?: Run[], children: BlockId[],
  parentId }`. Nesting and columns are in the schema (parent/children), not in the text.
- **Inline text = runs**: `Run { text, marks?: Mark[] }`, `Mark { type, attrs? }`. Offsets are UTF-16 code units.
  Marks: bold, italic, underline, strike, sup, sub, color, background, code, link, mention, comment
  (`marks.ts`); each has a **Peritext-style expansion** (`none|before|after|both`) and comments may stack (`multiple`).
- **Selection is model-level**: `TextSelection {anchor, head: {blockId, offset}}` or `BlockSelection {anchor, head}`
  (`types.ts:23-44`). Cross-block selection is carried by the model and painted with the CSS Custom Highlight API because
  browsers clamp a real `Selection` to one contenteditable host (`docs/ARCHITECTURE.md` D3, measured in Chromium).
- **Seven invertible ops**: `insert_block, delete_block, move_block (parent + after-sibling intent), update_block,
  insert_text, delete_text, format_text` (`ops.ts:6-32`); `applyOp` returns its exact inverse; `canApply` lets history skip
  ops whose anchors vanished. Transactions (`Tx`), coalescing history (154 lines), validation per block, `normalize` to
  fixpoint. This is a ProseMirror-like step system without the position mapping, because ids are stable.
- **Commands** (`commands.ts`, 327 lines), **structure** (lift/indent), **registry** (block plugins define schema, view,
  Markdown and HTML projections in one place, `define.ts` 726 lines).
- Blocks: paragraph, heading, bullet/numbered list, todo, toggle, quote, divider, callout, image, code, columns+column,
  table+row+cell, file, embed, toc, database (table/board/list/gallery views, formulas, relations), page/sub_page.
- **Storage**: Markdown both ways (`markdown/`, 339+96 lines, no regex in the core dirs by grep), HTML, YAML frontmatter,
  vault (`.md` folder, ids round-trip), Notion import, SQLite index in the CLI.
- **Collaboration**: Loro CRDT (`packages/collab`, `carnet/src/collab`), comments anchored to text, presence,
  WebRTC/relay. `BlockStore` is an interface a CRDT can satisfy (`v2-status.md`), so the core is CRDT-shaped, not CRDT-bound.
- **Undo**: op-inverse history, skips foreign-touched steps, coalesces by word, capped.

### 1.3 Size, tests, deps, licence [verified]

| Item | Value |
|---|---|
| Headless core files (model, commands, editor, history, registry, structure, validate, define, markdown, html) | 3,512 lines TS |
| `carnet/src/view/*` (DOM/contenteditable) | ~3.2k lines (`view/*.ts`: caret, selection, input, keymap, render, paint, gestures, scroll, highlight...) |
| `carnet/src/plugins/*`, `ui/*`, `blocks/*` | plugins ~7k, ui primitives ~3.1k, blocks ~6k (much DOM: menus, popovers, drag ghost, tables) |
| Runtime deps | none for `carnet`; `loro-crdt` only for collab; `emojibase-data`, `lucide-static` dev; React/Vue/Svelte only as mounts |
| Licence | MIT (`LICENSE`); `docs/design/licence.md` is the (now resolved) licence discussion |
| Unit tests | 47 files in `packages/carnet/test` plus v1 suites; Playwright e2e ~55 specs in `NBE/e2e` |

### 1.4 What is portable and what is not

Portable (pure logic, no DOM) **[verified by grep of `document.|window.|HTMLElement|Range` over these files: only prose
matches]**: `model/*`, `commands.ts`, `editor.ts`, `history.ts`, `registry.ts`, `structure.ts`, `validate.ts`,
`markdown/*`, `html/*`, `frontmatter`, `vault` (I/O aside), `workspace`, database query engine and formulas, `collab` seam
(`editor.touched(ids)`), the autoformat and keyboard tables. `carnet/headless` is the documented DOM-free entry
(`headless.ts:1-59`).

Not portable (browser-dependent) **[verified]**:
- Per-block `contenteditable="plaintext-only"` leaves, `beforeinput` re-expressed as commands, IME reconciled at
  `compositionend` (`view/render.ts:116-143`, `view/input.ts`, `v2-status.md:17`). All of this **is the browser doing text
  layout, caret, selection, IME, spellcheck, undo of composition, accessibility**. Zinc has none of it to lean on.
- Caret/selection mapping DOM<->model (`view/selection.ts`, `caret.ts`, `caret-move.ts`), Custom Highlight API painting
  (`view/highlight.ts:81,122`).
- `Intl.Segmenter` for grapheme and word boundaries (`model/grapheme.ts:29-31,152-154`); falls back to surrogate-pair
  handling. Zinc/QuickJS have no `Intl` **[inferred: Zinc's stdlib is what `lib/zinc.d.ts` declares; quickjs-ng ships no Intl]**.
- DOM-heavy UI: `ui/*` (overlay, menu, popover, position, tooltip, drag ghost, picker), format bar, gutter, slash menu
  rendering, image resize, table chrome, mermaid/mdx/embed/dropzone blocks, emoji picker (9.9k lines of data).
- Framework mounts are irrelevant: Carnet is vanilla, the React mount is 80 lines and would not run on Zinc's React anyway.

### 1.5 Fitness for the goal

- Good: the author already answered "what is the document if not HTML" three times. The model is small, invertible, tested,
  Markdown-native (matches Zinc's own `docs/*.md` habit), CRDT-ready.
- Risk 1: the project's own D1 evidence says per-block contenteditable is fragile on mobile IME
  (`NBE/docs/research/per-block-contenteditable-evidence.md`: Notion abandoned it in Jan 2021, quoted second-hand from a
  Notion engineer on HN). That is an argument to **stop depending on contenteditable**, i.e. for a native text layer.
- Risk 2: v2 is alpha (`2.0.0-alpha.0`), on a branch, one week old, mostly AI-assisted; APIs will move. Pin a commit.
- Risk 3: working tree of `rewrite/v2` is dirty; do not port from a moving target without a tag.

## 2. What Zinc offers (and lacks) for this

### 2.1 Language and compiler [verified]

- Strict TS subset to C++17 (`docs/guide/02-language.md:1-45`). Supported: classes, generics, unions, closures, `Map`/`Set`,
  `JSON`, async, destructuring, spread. **Rejected: regex (Z1008), `var`, `eval`, dynamic `import()`, `in`, `globalThis`,
  rest params (Z9009), labeled statements (Z9011), `any` in strict profiles** (line 36). Gradual profile has `Dyn` for
  `any/unknown` (line 82+): JSON without a type gives a checked `Dyn` tree; calling through a `Dyn` is Z9042.
- Strings are UTF-8 with UTF-16 indices, so **indexing non-ASCII is O(offset)** (`docs/ui.md:67`; `02-language.md:14`).
  Carnet's `Run` model indexes by UTF-16 offset per block, fine for paragraphs, bad for a 10k-char code block.
- Fit: Carnet's core uses no regex (grep), `Record<string, unknown>` props (needs typed props or `Dyn`), `Intl.Segmenter`
  (must be replaced), module-level registries and closures (supported). Autoformat rules are `{ when: RegExp }` in the
  plugin API (`AGENTS.md` shows `when: /^# /`), so the **plugin surface uses regex** and needs a small matcher DSL for
  Zinc. **[inferred, needs the spike]**

### 2.2 UI runtime [verified]

- `zinc:ui`: flexbox + software rasterizer, host tags `view text button image scroll canvas input textarea`
  (`docs/guide/03-ui-apps.md`, `compiler/src/jsx.ts:9`). Solid model (signals, `Show`, `For`, `_virtual`) and a **React-like
  model** (`lib/std/react.ts`): `useState useReducer useEffect useLayoutEffect useMemo useCallback useRef`, class
  components, keys, hook-order check at build; deps are `number[]` only (`react.ts:110-131`); **no context, no portals
  (layers are `ui.openLayer`), no `memo`/`forwardRef`** (grep of `react.ts`/`solid.ts`: no `createContext|useContext|Portal`).
  A component re-renders wholesale. Real React libraries do not run; only Zinc-written components do.
- Text: `<text>` has one font/size/bold per node; `wrapText` splits on spaces with baked metrics (`lib/std/ui.ts:799-813`);
  `lineHeightOf = size*1.4`. **No inline spans, no per-run style in a paragraph.** `bold` is a boolean (`ui.ts:168`),
  italic only via a separate family file (e.g. `Inter-Italic.ttf` in `examples/zed-editor`).
- Fonts: own TTF rasterizer, `cmap` 4/12, glyf composites, cache per (font,size) (`runtime/ttf.cpp:1-80`). grep finds **no
  kern/GSUB/GPOS/bidi/emoji/fallback** in `ttf.cpp`/`raster.cpp`: Latin-only quality, no Arabic/Indic shaping, no colour emoji.
- Text fields: `input`/`textarea` engine with caret, selection, word/line select, undo (100 steps), IME **committed text
  only** (`docs/ui.md:20-45,269`: "Not done yet: IME composition preview ... multiple carets ..."). Clipboard: text only
  (`hal_clipboard_get/set`, `zinc:gfx clipboardText`, `ui.md:263`).
- Code-editor hooks on the textarea: `setMarks` (fills, boxes, squiggles), `setEditColors`, `setHighlightAt` (colour runs per
  visual line), `editView`, `scrollEditTo`, `editRowOf` (`ui.md:47-64`). These are per-**textarea** and monochrome-font.
  One textarea per buffer is `examples/zed-editor`'s model (`examples/zed-editor/README.md`). A block editor with 500 blocks
  would be 500 textareas each with its own caret/undo/scroll: the wrong shape (see 3).
- Input: pointer capture, gestures (`onTap onLongPress onDrag onPinch`), key contexts and actions (`bindKeys`,
  `keyContext`, GPUI-style), focus scopes, layers with anchored positioning, dismissal stack, scroll physics
  (`ui.md:86-200`). **Good match** for slash menus, popovers, drag-drop, format bar.
- Virtualization: `ui.virtualize(h, count, itemH, render)` is **fixed row height** (`ui.ts:327-331`); variable heights are on
  the kit v2 plan, not done (`docs/reports/kit-v2-plan.md`, item 8) **[verified as planned, not verified as absent beyond grep]**.
- Accessibility: grep of `docs/*.md`, `lib/std/ui.ts` finds none. **No a11y tree.**
- Kit: shadcn-style components (`docs/ui-kit.md`, `lib/std/kit/*`): Button, Card, Tabs, overlays (Tooltip, Popover,
  DropdownMenu, Dialog, toast). `kit-v2-plan.md` lists Command palette, Combobox, Tree, VirtualList v2, Sidebar as planned.
- Testing: deterministic hooks `ui.pointerAt / keyDown / typeText / wheelAt`, `zinc test --pixels` golden frames
  (`ui.md` Tests). Good for porting Carnet's e2e-style specs.

### 2.3 Engines, QuickJS, plugins [verified]

- Four engines from the same source: native C++, Zinc VM (tier 0/1 + JIT on AArch64), QuickJS application runner
  (`docs/engines.md`), and the sim/Node oracle. UI on VM/QuickJS: "full UI pending" (`engines.md` table). So a UI app
  today means the **native** engine; VM/QuickJS parity for UI is not a given.
- `zinc:script` embeds QuickJS-ng in a sandbox with typed host functions (`plugins/script/plugin.json`). It is a
  **language runtime, not a browser**: no DOM, no `Intl` **[inferred]**.
- Plugins (`docs/plugins.md`): modules (Zinc + optional C++), displays (HAL). A rich text/layout engine fits as a native
  module (`native/<name>.spec.ts` + `.host.cpp`) with sim implementation in TS.
- Prior research (`docs/reports/research-2026-09-30/README.md`) covers AOT/JIT/QuickJS speed, WebGL, Docker-free studio.
  Relevant carry-over: QuickJS is ~14-30x slower than V8 on JS-side work for three.js, so a QuickJS-hosted editor bundle
  is a performance and correctness risk before anything else **[verified in that report, estimate there]**.

## 3. How others did rich text without contenteditable

| Project | Approach | Lesson for Zinc | Source |
|---|---|---|---|
| **Flutter super_editor** | `MutableDocument` of nodes + `Editor` that applies requests and reactions to it; rendering by per-node component builders; text input via platform text-input client, own caret/selection painting | Same split as Carnet: document + editor pipeline + component-per-block. Selection and IME are the app's job | [web] super_editor README |
| **AppFlowy editor** | `Document` tree of `Node`s, text stored as **Delta** (rich ops), other blocks as attributes; `Transaction` = list of ops (insert/delete/update + inverses); `BlockComponentBuilder` maps Node -> Widget | Confirms flat/tree nodes + Delta + Transaction + one builder per block. Their Delta = Carnet's `Run[]` | [web] AppFlowy blog, docs |
| **Zed** | Rope on a SumTree, `DisplayMap` layers (folds, inlays, wraps) between buffer and screen, GPUI paints glyphs; CRDT buffer; text coordinate systems (offset/point/display point) | Separate buffer coordinates from display coordinates; measure/wrap in the framework and hit-test with its own layout. For a block editor a rope per block is overkill, but the **coordinate-system discipline** is not | [web] Zed blog posts |
| **Lexical** | Editor state + node classes are separable from the DOM: `@lexical/headless` runs `update()`, transforms, listeners and JSON with **no root element (skips reconciliation and DOM selection)** | Proves the "headless core + swappable reconciler" architecture in the field; Carnet's `carnet/headless` is the same idea | [web] lexical.dev headless |
| **ProseMirror** | Immutable doc + `Step`s + `Transform` with position mapping, view is a separate package (`prosemirror-view`) | The reference for transaction/step design. Carnet trades mapping for stable block ids (op intent is `{parent, after}`), which is simpler and CRDT-friendlier | [inferred from prior knowledge, not fetched] |
| **Slate** | Value = JSON tree, operations are the only mutation, DOM sync is React-DOM specific | Same shape; its DOM sync is the part that always breaks (IME) | [inferred] |
| **BlockNote** | Block JSON is the native, lossless format; `ServerBlockNoteEditor` runs schema/blocks on the server; UI is separate | JSON block document as the interchange, server-side use of the same schema | [web] blocknotejs.org |
| **Notion** | Everything is a block; text is a property with marks; pages, database rows are blocks | The block model itself; Carnet matches it | [web] notion.com blog |
| **Peritext / Loro** | Formatting as spans anchored to character ids with per-mark expansion; Loro implements Peritext+Fugue and exposes `configTextStyle` | Carnet's `MarkExpansion` is exactly this vocabulary. If collab is wanted, use Loro (already wired in `packages/collab`) or Automerge; do **not** invent a rich-text CRDT | [web] inkandswitch.com/peritext, loro.dev |
| **Yjs/Automerge** | General CRDTs; ProseMirror/Lexical bindings map steps to CRDT ops | Bindings live at the transaction boundary: Carnet's `editor.touched(ids)` is that seam | [inferred] |

### Architecture decision

**Headless document + closed invertible op set + transactions/history (Carnet's design) with three swappable layers:**
1. `core` (pure TS, Zinc-subset): model, ops, history, commands, Markdown/HTML projections, autoformat table, block registry.
2. `text engine` (native, shared with the code editor): shaping/wrapping of styled runs, hit testing, caret/selection
   geometry, IME, clipboard, grapheme/word segmentation.
3. `view` (per host): DOM view (today's `packages/carnet/src/view`), Zinc view (new), GPUI/SwiftUI views (existing ports).

Selection, caret and IME state live **in the model layer** (already true for Carnet's `Selection`), and the view only
reports pointer positions -> model points and paints. This is what makes contenteditable unnecessary and is the same
conclusion the native ports reached.

## 4. Options, ranked

### (i) Keep the TS logic, compile it with Zinc, rewrite the view layer in Zinc JSX. **Recommended.**

- What moves: the 3.5k-line headless core plus the block definitions' schema/Markdown halves. What is rewritten: `view/*`,
  `ui/*`, plugin UI (slash menu, gutter, format bar), each block's `view`.
- Work items unique to this option: (a) a **Zinc-subset lint** on the core (no regex, typed props, no `Intl`, no `in`,
  no rest params, no labeled statements); (b) replace `RegExp` in the plugin API (`when`, paste rules) with a small
  literal/prefix matcher; (c) props typing (`Record<string, unknown>` -> per-block typed props class or `Dyn`); (d) grapheme/
  word segmentation as a native module (`zinc:text`), TS fallback for the sim; (e) `Run[]` cost with non-ASCII UTF-8 strings.
- Keeps: the tests (port vitest to `zinc test`), Markdown vault, Loro collab option (Loro has Rust core; QuickJS/Wasm route
  or native binding, out of scope here), parity with the Swift/GPUI ports (add a fourth parity test).
- Effort for the core port alone: 3-5 weeks **[inferred]**; view + text engine dominate (section 6).
- Risk: keeping two targets (browser and Zinc) compiling from one core means Carnet's own evolution must obey the subset.
  Mitigation: subset lint in Carnet CI; one-way sync (Zinc vendors a pinned commit of `core`).

### (iii) Re-implement the core natively in Zinc TS sharing only a headless *contract*

- Same as (i) but as a fresh Zinc-idiomatic model (typed classes, `@value` runs, arena allocation, rope for big text) with a
  parity test against Carnet like Swift/Rust have. Better perf and typing, no Dyn, no regex; cost: forks the logic a
  fourth time and loses the free tests. Choose it only if the spike shows (a)-(c) above are worse than a rewrite, or if a
  rope/`@value` design is needed for performance on rM/Pi. Effort +4-6 weeks over (i) **[inferred]**. Tables and command
  semantics would be locked by the parity tests, as Rust did (`native/gpui/README.md`, "Les trois crates").

### (ii) Run the browser bundle on QuickJS/JSC with a DOM shim. **Reject.**

- The bundle's input, caret, selection, IME and painting are contenteditable + Range + Custom Highlight + CSS layout
  (`view/*`, `ui/position.ts`). A DOM shim would have to implement text layout, Range geometry (`getClientRects`), selection
  and CSS. That is writing a browser. `zinc:webview` (plugin exists in `plugins/webview`) would just embed a real
  engine, which is a valid *product* (Studio Docs tab) but not "Zinc-native".
- QuickJS speed (14-30x slower than V8 on JS-heavy work, research note) and missing `Intl.Segmenter` **[inferred]** make
  it worse. Engine parity for UI is "pending" (`engines.md`).
- Legit narrow use: run `carnet/headless` + `markdown` in `zinc:script` as a **sandboxed plugin runtime** (e.g. Markdown
  import/export tool) where no UI is involved. **[inferred]**

Ranking: (i) > (iii) > (ii). (i) and (iii) share the same UI work; the choice can be deferred to the spike outcome.

## 5. Gaps in Zinc UI to fill first (tied to the code-editor study, assuming one shared text engine)

Ordered by dependency. "CE" = shared with the code editor.

| # | Gap | Today [verified] | Needed for block editor | CE shared? |
|---|---|---|---|---|
| 1 | **Rich-text span layout** | `<text>` = one style; `wrapText` by spaces (`ui.ts:799`) | `RichText` node: `Run[]` with per-span font/weight/italic/colour/underline/strike/code bg/link, wrapping across spans, line boxes with mixed sizes, inline atoms (mentions, emoji) | Partly (code editor needs colour runs per line: `setHighlightAt`) |
| 2 | **Shaping and fallback** | none (`ttf.cpp`) | at least kerning + font fallback + colour emoji; complex scripts later (HarfBuzz as a native module on host targets, none on esp32/ps1) | Yes |
| 3 | **Grapheme/word/line-break segmentation** | none; Zinc has UTF-8 storage | UAX#29 grapheme + word, UAX#14 line breaking (Carnet's `grapheme.ts` needs `Intl.Segmenter`) | Yes |
| 4 | **Text geometry API** | `editRowOf`, `caretOf`, `editView` per textarea | per-run hit test (point -> (blockId, offset)), caret rects, selection rects for any offset range, across blocks | Yes |
| 5 | **Caret and selection across blocks** | one focused textarea has caret; no cross-node selection | Model-owned selection painted by the view (Carnet's D3 solution): selection rect painting per block, caret blink, block selection; must survive virtualization | Partly |
| 6 | **IME** | committed text only; preedit not done (`ui.md:269`) | preedit string + cursor + candidate window placement (`SDL_SetTextInputArea` exists as `hal_text_input`), composition events into the input layer | Yes |
| 7 | **Input host without a textarea** | text input is bound to `input`/`textarea` nodes | a "text sink" node: focus + text/key/IME events routed to JS with no internal buffer, so the model owns the text (this is the key enabler; `zinc:ui` already has `ui.typeText` for tests) | Yes |
| 8 | **Clipboard rich formats** | text only (`hal_clipboard_*`) | write/read `text/plain` + `text/html` (or a custom `application/x-carnet+json`) + image; SDL3 supports multiple mime types **[inferred]**; wasm HAL via async Clipboard API | Partly |
| 9 | **Undo** | textarea undo (100 steps) is internal | none needed: Carnet's op history replaces it, but the text sink must disable the field's own undo | No |
| 10 | **Scroll + virtualization** | `virtualize` fixed row height (`ui.ts:327`) | variable-height virtual list with `scrollToBlock`, stable scroll anchoring on height change (Carnet has `scroll-stability.spec.ts`), 500+ blocks | Partly (long files) |
| 11 | **Drag and drop** | pointer capture, `onDrag`, layers | already sufficient for block drag with ghost and drop indicator (Carnet's gutter drag is ~600 lines of DOM); file drop from OS is a HAL feature (GPUI app does it; Zinc: unknown) **[inferred]** | No |
| 12 | **Overlays** | `openLayer`, `anchor`, dismissal, focus scopes | enough for slash menu, format bar, block menu; **`anchor` to a text range rect** needs gap 4 | No |
| 13 | **Accessibility** | none | a11y tree/announcement of focused block and selection; hard on SDL; state as a known limitation for v1 and design the block tree so it can map (Carnet cites Gutenberg's Navigation/Edit model) | No |
| 14 | **Images, tables, embeds** | `image` node, `canvas` | images fine; tables need grid layout (not implemented: "grid" rejected, `ui.md` styles); embeds via `zinc:webview` on desktop only | No |
| 15 | **Code block highlight** | `tsHighlight`, `setHighlightAt` | reuse `examples/zed-editor/src/app/syntax.ts` tokenizers on `Run` marks; Carnet's `blocks-code` uses CSS Custom Highlight (not portable) | Yes |

Key design decision: **do not build the editor from `textarea` nodes.** One textarea per block gives 500 independent
carets/undo stacks/scroll states and no cross-block selection. Build one **`RichText` block node + a single text sink** and
let the model own selection. The code editor study should land the same `text sink + geometry API` so both editors share it
(a code buffer = one big monospace RichText with a line-number gutter and a rope/line index).

## 6. Phased plan

Effort in person-weeks, one strong developer, **[inferred]**, excludes review latency.

| Phase | Deliverable | Weeks |
|---|---|---|
| P0 spike | Vendor a pinned Carnet commit; run `zinc check` on `model/*`, `commands`, `history`, `markdown`. Produce the Z-code error list, decide (i) vs (iii). Print a doc round-trip (JSON -> Markdown -> JSON) under `zinc test` on native and VM | 1-2 |
| P1 text engine (shared with code editor) | `zinc:text` native module: segmentation (grapheme/word/line), kerning + fallback, `RichText` layout (runs, wrap, hit test, caret/selection rects); sim implementation for `zinc test` | 5-7 |
| P2 input layer | text sink node, IME preedit, key routing to commands (reuse `bindKeys`, port Carnet's keymap/autoformat tables), model-owned selection + caret blink | 3-4 |
| P3 core port | subset lint + fixes, typed props, matcher DSL instead of RegExp, tests ported; parity test vs TS output | 3-5 (parallel with P1/P2) |
| P4 block view MVP | paragraph, heading 1-3, bullet/numbered/todo, quote, divider, callout, code (no highlight first), image; block selection; virtualized column | 4-5 |
| P5 chrome MVP | slash menu, markdown shortcuts, format bar (bold/italic/code/link), block gutter with drag, undo/redo, clipboard (text + markdown + internal JSON) | 3-4 |
| P6 storage | Markdown vault (open folder, `fs` watcher, atomic save), frontmatter, page tree sidebar | 2-3 |
| P7 later | tables (needs grid layout), toggles/columns, database views, comments, search, Loro sync, a11y, Windows/Linux IME validation, e-ink profile | 10-20 |

**MVP definition (end of P6, ~20-28 weeks solo, ~14-18 with a second developer on the text engine):**
a Zinc app on macOS/Linux (native engine) that opens a folder of `.md` files, edits them WYSIWYG with the 10 block types
above and 5 marks (bold, italic, code, strike, link), slash menu, Markdown shortcuts, drag to reorder, cross-block
selection, copy/paste (text, Markdown, internal JSON), undo/redo with coalescing, 500 blocks at 60 fps, IME for CJK
on macOS, saved as Markdown with ids in frontmatter or `.nbe`-compatible sidecars. Explicitly out of MVP: tables,
databases, collaboration, comments, mobile, a11y, complex-script shaping.

Comparison point **[verified]**: Carnet's GPUI port reached most of the text/blocks/drag/vault surface in ~6.5k lines
of Rust but leans on GPUI's text system, IME and platform clipboard; Zinc must build those.

## 7. Relation to Zinc Studio, docs tooling and the reMarkable notes app

- **Studio** (`docs/studio.md`, `apps/studio`): today it embeds the docs with `zinc:webview` (listed in its stack) and has
  a Script box with a code area. A native block editor would replace the webview Docs tab with an editable, Markdown-backed
  pane over the repo's own `docs/*.md`, and give the flow diagram nodes a rich-text description field. Same text engine as
  the Script/Generated-code editor. **[verified for the webview and Docs tab; the replacement is inferred]** The research
  README warns "ZincStudio" already names the box editor: pick another product name.
- **Docs tooling**: Carnet's vault is plain Markdown + YAML frontmatter (`markdown/`, `frontmatter/`), the format Zinc docs
  already use, so `docs/**/*.md` can be opened as a vault with no conversion, and `zinc.json`/guide samples could live in
  code blocks. **[inferred]**
- **reMarkable notes** (`examples/remarkable/notes`): it is an **ink** notebook (`zinc:ink`, strokes saved as JSON/SVG,
  `notebook.ts`, `README.md`), not text. A block editor complements it: typed blocks + ink blocks in one page model
  (a new `ink` block whose payload is the existing `Stroke[]`). E-ink constraints: latency already "unacceptable" for ink
  in FAST mode (`examples/remarkable/notes/README.md`, `docs/reports/rmpp-latency-2026-09-29.md`), no software keyboard
  guaranteed (Type Folio or the kit's virtual keyboard, `lib/std/kit/keyboard.tsx`), partial-refresh needs block-level
  dirty rects. Carnet's block-granular redraw (`v2-status.md`) matches that. Target after MVP, with an e-ink theme.
  **[inferred]**

## 8. Open questions / what I did not verify

- Whether `zinc check` accepts Carnet's core as is: not run (read-only, dirty tree). The spike answers it.
- Whether Zinc's SDL HAL exposes `SDL_EVENT_TEXT_EDITING` (preedit) and multi-mime clipboard: only `hal_text_input` and text
  clipboard are documented; not read in C++.
- Whether the Zinc VM/QuickJS engines can run a UI app (`engines.md` says pending): plan assumes native engine only.
- Performance of Zinc's software rasterizer for full-window rich text at 60 fps; `docs/reports/PERF.md` not consulted.
- Carnet claims in its README (test counts, byte sizes, latency 8.3 ms at 500 blocks, `docs/NEXT.md:1-20`) were read, not re-run.

## Sources

- Carnet/notion-block-editor (local): `README.md`, `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/NEXT.md`, `docs/design/v2-status.md`,
  `docs/research/per-block-contenteditable-evidence.md`, `packages/carnet/src/{model,commands,editor,history,view,headless}`,
  `native/gpui/README.md`.
- Zinc (local): `docs/ui.md`, `docs/ui-kit.md`, `docs/guide/02-language.md`, `docs/guide/03-ui-apps.md`, `docs/engines.md`,
  `docs/plugins.md`, `docs/studio.md`, `docs/reports/kit-v2-plan.md`, `docs/reports/research-2026-09-30/README.md`,
  `lib/std/{ui,react,solid}.ts`, `lib/std/kit/host.ts`, `compiler/src/jsx.ts`, `runtime/ttf.cpp`, `examples/zed-editor`,
  `examples/remarkable/notes`.
- Web: https://www.inkandswitch.com/peritext/ ; https://loro.dev/blog/crdt-richtext ;
  https://lexical.dev/docs/concepts/headless ; https://appflowy.com/blog/how-we-built-a-highly-customizable-rich-text-editor-for-flutter ;
  https://appflowy.com/blog/demystifying-appflowy-editors-codebase ; https://github.com/Flutter-Bounty-Hunters/super_editor ;
  https://zed.dev/blog/zed-decoded-rope-sumtree ; https://zed.dev/blog/zed-decoded-text-coordinate-systems ;
  https://www.blocknotejs.org/docs/features/server-processing ; https://www.notion.com/blog/data-model-behind-notion
  (search-result summaries only; pages were not fetched in full).
