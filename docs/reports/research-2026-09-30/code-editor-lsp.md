# From a textarea to a real code editor: editing core, tree-sitter, LSP, Zinc language server (2026-09-30)

Status: research only, nothing here is implemented. Tags: **[verified]** read in this repo, **[web]** fetched or searched
during this study (sources at the end), **[bg]** background knowledge not re-checked online, **[inferred]** my
reasoning or estimate. Effort figures are estimates in engineer-weeks (ew) for one person who knows the codebase.
Repo state: the working tree was dirty (many modified files); line numbers below are from the tree as read.

## 1. What exists today

### 1.1 The editor is the engine's `<textarea>`, not a component

There is no separate editor widget. A "code editor" is a `<textarea>` in code mode plus a small extension API.
[verified]

- `lib/std/ui.ts:17-18`: `INPUT`/`TEXTAREA` node tags. `ui.ts:233`: `n.ed = new Edit(tag === TEXTAREA)`.
- `codeMode()` (`ui.ts:1151`): a multi-line field with `lineNumbers` or a mono font. In code mode Tab inserts 2 spaces
  and Enter keeps indentation (`ui.ts:1426`, `docs/ui.md:28`).
- Extensions for editors (`ui.ts:1556-1640`, `docs/ui.md:49-63`): `setMarks` (line/fill/box/squiggle/gutter marks),
  `setEditColors`, `setHighlightAt(h, f(line, start))`, `editView`, `scrollEditTo`, `editRowOf`, `repaint`.
- `examples/zed-editor` (2.5k lines of Zinc, `examples/zed-editor/README.md`) is a Zed-style app on top of it:
  project tree, tabs with preview semantics, find bar, palette/finder, minimap, terminal panel via `zinc:process`,
  `zinc check --json` diagnostics as squiggles. "One textarea per buffer" (README, "What it shows").
  Scenes and a scroll benchmark are scripted through the input test hooks (`ZINC_DEMO=...`).
- Conformance test: `tests/conformance/code_editor.tsx` drives the extension API headlessly and records `.out` files
  per resolution and number profile. [verified]

### 1.2 Text model

`class Edit` (`ui.ts:80-108`): the whole document is **one string** `value`; `caret`/`anchor` are UTF-16 offsets;
undo/redo are **whole-string snapshots** in `string[]` stacks capped at 100 (`ui.ts:1318-1324` `snapshot()`); an edit
is `value.slice(0,a) + s + value.slice(b)` (`ui.ts:1333`). One selection only. Typing coalesces into one undo step
(`e.typing`). There is no tree/branching undo. [verified]

Zinc strings are UTF-8, so indexing a non-ASCII string costs O(offset); `docs/ui.md:66-68` says fields work "line by
line" and code walking the value should `split('\n')`. Consequences [verified/inferred]:

- Every edit is O(document size): string rebuild, then `ensureRows` (`ui.ts:1153-1181`) re-splits the whole value and
  re-wraps every line whenever `value` or width changed (`rowsFor === value` check at `ui.ts:1153`).
- `rowOf` is a linear scan over rows (`ui.ts:1185-1188`); `offAtX` and `xIn` measure per character by calling
  `textWidth` on 1-char slices (`ui.ts:1190-1201`); hit-testing and caret x are O(row length) text measurements.
- zed-editor keeps its own second copy of the text: `Doc` (`examples/zed-editor/src/app/document.ts:29-61`) re-splits
  into `lines`/`starts` after each edit and re-tokenizes from line 0 (`ponytail:` comment at line 52). Measured by the
  authors: keystroke in a 5006-line file 4-5 ms; 5000-line scroll at 111-119 fps (README "Scenes and measurements").
  That is fine for thousands of lines and hopeless for tens of MB.

### 1.3 Input, IME, clipboard, layout, rendering

- Keys/typed text arrive in order from the HAL (`docs/ui.md:260-271`). Movement/deletion handling is in `ui.ts:1379-1430`
  (word/line/char, goal column `goalX`). Pointer: click, word/line selection, drag select (`ui.ts:1941`).
- **IME**: `startTextInput(x,y,w,h)` follows the focused field so the OS candidate window is placed next to it
  (`ui.ts:2178-2182`, `runtime/gfx.cpp:912-913`, `targets/macos/hal_sdl.cpp:415`). Only committed text works:
  `docs/ui.md:270` "Not done yet: IME composition preview ... multiple carets, word-wise drag selection after a double
  click". No preedit string, no marked-text range, no `TEXT_EDITING` handling. [verified]
- **Clipboard**: `hal_clipboard_get/set` (weak default process-local; SDL3 HAL implements it, `hal_sdl.cpp:430-437`),
  `clipboardText`/`setClipboardText` exposed by `zinc:gfx`. Text only. [verified]
- **Bidi / shaping**: none. `runtime/ttf.cpp` (332 lines) is a from-scratch TrueType rasterizer: `cmap` lookup
  (format 4/12, `ttf.cpp:62`), `glyf` outlines, `hmtx` advances; no GSUB/GPOS/kern tables found (grep "kern|GPOS" empty),
  glyph cache per (font, size), fixed table of 32 fonts (`ttf.cpp:228`). `textWidth` (`gfx.cpp:796`) sums advances.
  Consequently: no ligatures, no combining marks positioning, no Arabic/Indic shaping, no bidi reordering, no color
  emoji, no font fallback chain. [verified for what is present, inferred for "no fallback" from absence of any code]
- **Rendering**: software rasterizer in bands, on the CPU (`runtime/raster.cpp`); an optional GPU/GLES path is designed
  and Phase 1 implemented (`docs/reports/gpu-renderer-design.md`). The editor paints only visible rows: `paintEdit`
  slices the visible rows once per frame (`docs/ui.md:66-68`). Wheel/trackpad physics are engine-level.
- **Accessibility**: nothing for text fields (no AccessKit or platform tree found). [inferred from grep: no matches]

### 1.4 What zed-editor already covers (so it is not on the roadmap)

Tabs and preview tabs, find in file (plain text, not regex; `src/app/search.ts`, 74 lines), fuzzy finder and palette,
bracket matching marks, indent guides, soft wrap, zoom, minimap (canvas, token-coloured), lexical highlighting for
TS/TSX/JSON/Markdown/CSS with carried per-line state (`src/app/syntax.ts`, 234 lines), file tree, terminal **output
only** (no stdin/PTY), diagnostics from `zinc check --json` on the *saved* file (`src/app/tools.ts:70-79`). Its own
"Limits" section: one caret, no split panes, no go-to-definition, tokens recomputed from line 0, no unsaved-buffer
prompt on window close. [verified]

### 1.5 Platform facilities the roadmap can lean on

- **Process spawn already exists**: `zinc:process` (`plugins/process/`, `docs/plugins/process.md`): `spawn(cmd, args,
  {cwd, env})`, `onStdout(line)`, `onStderr`, `onData(chunk, isStderr)` raw chunks with UTF-8 never split, `write(s)`,
  `closeStdin()`, `kill`, exit code, up to 32 children, `posix_spawnp` with three pipes and a `zrt::Poller` on the
  event loop; targets macos/linux/rpi1. Callbacks are only delivered from the event loop. [verified] Gaps for LSP:
  `write` **blocks** when the child stops reading and the 64 KiB pipe is full (`docs/plugins/process.md:54-55`);
  no PTY; string-only I/O (no binary-safe `Content-Length` counting: LSP counts **bytes**, JS/Zinc string lengths
  are UTF-16/UTF-8-ambiguous, see 5.2).
- **TCP/Unix sockets/WebSocket** exist: `zinc:socket` (`docs/plugins/socket.md`), non-blocking, poller-driven, requires
  `net` + `process`. So LSP over TCP is possible today. [verified]
- Plugin system: `plugins/<name>/plugin.json`; `kind: module` = Zinc `index.ts` + optional native C++
  (`native/<name>.spec.ts`, `<name>.<target>.cpp`, `.sim.ts`), vendored `.c` sources compile into a separate static lib
  (`docs/plugins.md` "plugin.json", `sources`/`pkg`/`libs`); availability per target (Z5003). [verified] That is
  exactly the shape a vendored tree-sitter needs.
- Engines: the same app should run native / Zinc VM / QuickJS, with sim on node; "full UI pending" for VM and QuickJS
  (`docs/engines.md`). Any editor core in `lib/std` written in Zinc TS inherits all engines; a native-only core does
  not. [verified/inferred]
- Testing: deterministic headless replay (virtual clock, recorded `HalInput` tapes with keys/text/pointer,
  `ZINC_RECORD`/`ZINC_REPLAY`, `docs/guide/06-testing.md:103-132`), `.out` conformance per resolution and number
  profile, pixel tests (`zinc test --pixels`), test hooks (`ui.pointerAt`, typed text injection at `ui.ts:2323`).
  Tapes do not carry IME composition (no such HAL field) or pen samples. [verified]

### 1.6 The compiler frontend (for section 6)

- `compiler/src/frontend.ts:128 loadProgram(entry, extra, virtual)` builds a real `ts.Program` with a custom
  `CompilerHost`, **virtual files supported** (`virtual` map, lines 131-136) and module path mapping for `zinc:*`
  (`STD_MODULES`, line 32+, plus plugin modules). It exposes `program`, `checker`, `sources`, `tsDiagnostics`.
  The type system is TypeScript's own checker (`package.json`: `@typescript/typescript6` 6.0.2 dependency, `typescript` 7.0.2 dev).
- `Sema` (`compiler/src/sema.ts`, 1244 lines) and HIR (`hir.ts`, 1028) are lowerings **on top of** the TS checker; their
  locations are per-node `{file, line, column}` (`hir.ts:173 location()`), not ranges. `ZincError` carries one `Diag`
  and `guard()` (`cli.ts:225-230`) aborts on the **first** Zinc error (Z-codes); `zinc check` prints `[]` on success
  (`cli.ts:1102-1108`). So today: TS diagnostics as a list, Zinc-specific diagnostics one at a time, no ranges
  (start only), no incremental program. [verified]

## 2. Lessons from real editors [web unless marked]

| Editor | Text model | Lessons for Zinc |
|---|---|---|
| **Zed** | Rope as a B+ "SumTree" with per-node summaries (length, lines, UTF-16 length) giving O(log n) seek in any dimension, ref-counted immutable nodes so background threads take snapshots; buffer is CRDT-based (`text::Buffer`), `language::Buffer` adds syntax tree + diagnostics, `MultiBuffer` composes excerpts; `SyntaxMap` supports injections; `lsp` crate is the client | Summaries are the trick: keep utf8/utf16/line counters in every node so LSP position conversion is cheap. Snapshots enable background parse/highlight. CRDT is only needed for collaboration: skip. |
| **Xi** | Rope + CRDT + separate frontend/core/plugin processes, JSON IPC | Retrospective: async is a complexity multiplier; process separation made scrolling take months; CRDT overreach; plugin interface too coupled to highlighting; no platform toolkit rendered text fast enough. **Keep the core in-process with the UI**, keep LSP/tree-sitter async but behind narrow snapshot-based interfaces. |
| **VS Code / Monaco** | Was `ModelLine[]` (40-60 B/line, 35 MB file = 600 MB); since 1.21 a **piece tree**: piece table + red-black tree + cached line breaks; the team tried C++ and dropped it because JS/native boundary crossings cost more than they saved | A piece table wins for open speed and memory on huge files; but per-call boundary cost dominates when an API is chatty. Zinc compiles TS to C++ AOT (no boundary) on native, but the VM/QuickJS engines have one: keep hot loops inside one module. |
| **CodeMirror 6** | Immutable state; **transactions** (changes + selection + effects) are the only way to change state; selections are a sorted set of ranges with a primary one; viewport-only rendering with height map; extensions via facets | Best model to copy for API: `State`, `Transaction`, `ChangeSet` (mappable), `Selection` ranges auto-merged. Old and new state coexist, which makes undo, async results (LSP responses mapped through later changes) and headless tests trivial. |
| **Helix** | Ropey rope; `Selection` of `Range{anchor, head}` as the core primitive; OT-like `Transaction` invertible for undo, selections and marks mapped across a transaction; undo tree; tree-sitter highlighting (the stock `tree-sitter-highlight` is not incremental, so they built `tree-house`); built-in LSP | Same model as CM6. Highlighting must reuse the old tree with `ts_tree_edit`; do not call stock high-level highlighter per frame. |
| **Kakoune** | Multiple selections are the engine; every command applies to every selection; oriented inclusive ranges | Design the command layer as "for each range" from day one. Multi-cursor is not a feature layered on later; retrofitting is where editors hurt. |
| **Lapce** | Rope (xi-rope lineage), tree-sitter, wgpu render, `lapce-proxy` process to talk to LSP/FS locally or remotely | The proxy split exists for remote dev; for a local-first Zinc editor, spawn servers directly. |
| **Neovim** [bg] | Line-array buffer (memline/B-tree blocks), extmarks for decorations, tree-sitter + LSP built in, semantic tokens as highlight overlay | Extmarks (ranges that follow edits) are the general decoration primitive. `setMarks` today takes absolute offsets and is replaced wholesale on every change; it needs anchors that move with edits. |
| **Ropey / crop** [bg] | Rust rope crates; ropey tracks chars and line breaks (UTF-8 storage, chunk ~ 1 KiB leaves) | Leaf chunk size ~1 KiB, counters for bytes/chars/utf16/lines. Implementable in ~600 lines of Zinc. |

Text-shaping [bg]: CoreText (macOS), HarfBuzz+FreeType (Linux, portable, MIT-licensed HarfBuzz), Pango on top of HarfBuzz.
AccessKit [web]: Rust with C bindings, adapters for Windows UIA, macOS NSAccessibility, Linux AT-SPI, Android; supports
single and multi-line text edit controls. Only relevant later (see 4.6).

Tree-sitter [web]: MIT, runtime is pure C and dependency-free, designed to be embedded, incremental parsing
(`ts_parser_parse` with the old edited tree), robust to syntax errors, "fast enough to parse on every keystroke".
Grammars are C (`parser.c` [+ `scanner.c`]) files generated per language [bg]; each grammar is 100 KB to several MB of
C source; queries (`highlights.scm`) are s-expression files [bg].

LSP 3.17 [web]: JSON-RPC 2.0 with `Content-Length` header (bytes, UTF-8); `initialize` handshake gates all other
requests; incremental `textDocument/didChange`; positions are UTF-16 code units by default and 3.17 adds
`positionEncoding` negotiation (UTF-8, UTF-16 mandatory, UTF-32); semantic tokens, inlay hints, workspace folders as
capabilities. Servers: typescript-language-server and pyright need `--stdio`, **rust-analyzer must not get `--stdio`**
(exits with code 2), clangd takes no flag [web, one issue-tracker source; confirm before hard-coding].

## 3. Design for Zinc

### 3.1 Where does the editor live? Native vs Zinc TS

Recommendation [inferred]: **write the editing core in Zinc TypeScript** as a new std module (`lib/std/editor/` exposing
`zinc:editor`), not in C++.

- Zinc compiles to C++ AOT, so on the native engine there is no boundary and the code is compiled; VM and QuickJS
  engines run the same source. A C++ core would fork the engines (VS Code's lesson on boundary cost applies to the VM and
  QuickJS engines) and would need `.sim.ts` twins for the node sim (ADR 0010 module rule, `docs/plugins.md`).
- Native is needed only where Zinc cannot: **tree-sitter** (vendored C), **text shaping** (later), process/socket I/O
  (already there), OS IME/clipboard (already in HAL, needs preedit fields).
- Performance risk: PERF.md says Zinc is ~13x QuickJS geomean but string/Map-heavy kernels benefit least (2.1x on strings,
  `docs/reports/PERF.md:101-119`). The core therefore must **not** be string-slice based: use typed arrays/chunks and
  integer offsets, never concatenate the document.

The existing `<textarea>` stays as the small-form field. The new component is a distinct node kind or a canvas-backed
widget. Two options:

- (A) New engine node `EDITOR` painted by new `paintEditor` in `ui.ts`, reusing scroll physics, focus, key routing,
  IME hook and marks painting. Pro: input/IME/scroll/focus for free. Con: `ui.ts` is already 2843 lines.
- (B) A widget drawn with `gfx` inside a `<canvas onDraw>` plus key/pointer handlers in a std module. Pro: isolated,
  no ui.ts growth. Con: must re-implement focus/IME/clipboard glue and scroll physics.

Recommend (A) with the model in `lib/std/editor/*` and only the painter/input glue in `ui.ts` (or a sibling
`lib/std/ui-editor.ts` imported by `ui.ts`). [inferred]

### 3.2 Data model: piece table vs rope

Choose a **B-tree rope with summaries** (Zed/Ropey style), not a plain piece table [inferred, informed by 2 above]:

- Leaves ~1 KiB UTF-8 chunks; node summary = {bytes, utf16, lines, maxLineUtf16?}. Conversions offset <-> (line, col) <->
  utf16 are O(log n). This one structure serves editor coordinates, LSP UTF-16 positions, and tree-sitter byte offsets
  (tree-sitter wants byte offset + (row, column-in-bytes) in `TSInputEdit`).
- Snapshots are cheap (persistent nodes): tree-sitter reparse, LSP `didChange` diffing, search and highlighting can run on
  a snapshot, and undo restores by structure sharing (no more 100 full-string snapshots).
- Piece table (VS Code) is comparable for editing but its line/offset queries need the RB-tree anyway; the rope gives
  the same complexity with simpler snapshots. Gap buffer is best for a single caret and worst for multi-cursor and
  snapshots, so rejected.
- Since Zinc strings are UTF-8 with O(offset) non-ASCII indexing (`docs/ui.md:66`), the rope must operate on **bytes**
  with explicit counters and never call `charCodeAt` on a big string. Needs byte-level string API in zinc (check
  `zinc:web`/string ABI; an `Uint8Array` chunk with a utf8 decoder is fine). [inferred]
- ~1500 lines of Zinc; 2-3 ew including property/fuzz tests against a naive string model (fuzz infra exists:
  `tests/fuzz`).

### 3.3 Selection model, transactions, undo

Copy CodeMirror 6 + Helix [web]:

- `Range {anchor, head, goalColumn}`; `Selection` = sorted, non-overlapping array + `primary` index; normalize merges
  overlapping ranges (same as CM6 and Kakoune). All commands are `(state, range) -> change`, applied to every range. [inferred]
- `ChangeSet` = sequence of retain/insert/delete over the old document, composable, invertible, and able to **map**
  positions (selections, marks, diagnostics, LSP ranges, tree-sitter edits). One `Transaction` = ChangeSet + new selection
  + metadata (user event, "typing" coalescing key, `addToHistory`).
- Undo: **history tree** (Vim/Helix style) rather than linear stacks. Store inverted ChangeSets + selection before/after;
  linear undo/redo is a walk; "earlier/later" and branch navigation are cheap extras. Group by time (~500 ms) and event kind
  like CM6. A tree costs little more than two stacks.
- Marks/decorations: `RangeSet` of anchored ranges mapped through ChangeSets (extmark-like). The current
  `setMarks(h, flat i32[])` is replaced by `setDecorations(layer, rangeSet)`, layers for search, diagnostics, brackets,
  semantic tokens, LSP document highlights, inline hints.
- Code folding = a decoration kind that hides line ranges (fold ranges from tree-sitter `folds.scm` or indentation);
  handled in the layout layer (3.4). Bracket matching = tree-sitter node pairs when a tree exists, else the current scan.
  Comment toggle, auto-indent, snippets (`$1`, `${1:placeholder}`, mirrored tabstops as multi-selection sets),
  and find/replace are all transaction producers.
- Find/replace with **regex**: Zinc has no regex engine documented. Check `zinc:web` (`docs/guide/09-web-apis.md`) before
  choosing; otherwise embed a small non-backtracking regex (RE2-style Pike VM ~600 lines) run chunkwise over the rope,
  or vendor `tiny-regex`/`SLRE`-class C (needs UTF-8 and lookaround limits documented). [inferred; regex support not verified in this repo]

### 3.4 View model, layout and rendering

Today `ensureRows` re-lays out everything on any change (`ui.ts:1153`). Replace with:

- A **height map / line-layout cache** keyed by line index and mapped through ChangeSets: wrapped-row count per
  line, x-advance cache per line (or per chunk), invalidated only for touched lines and on width change. Row lookup by
  binary search over a Fenwick/sum tree instead of `rowOf` linear scan (`ui.ts:1185`). Folded ranges are 0-height entries.
- **Display map pipeline** (Zed): buffer coords -> fold map -> tab map -> wrap map -> inlay map -> display rows.
  Inlay hints and folds are just transforms in this chain. Start with fold + wrap only. [web/inferred]
- Only visible rows are shaped and painted (as now). Keep the per-frame slicing but slice rope leaves, not a string.
- Glyph cost: `textWidth` per character is the bottleneck for hit testing. Add a per-font monospace fast path
  (advance = constant; detect from `hmtx`) so column<->x is arithmetic; keep the measured path for proportional fonts.
  This alone covers >95% of code editing use. [inferred]
- Minimap: keep the lazy canvas but feed it line token summaries from the tree-sitter highlight cache instead of re-lexing.
- Split panes: view state (scroll, selection set, folds) is per *view*, document state (rope, history, tree, diagnostics)
  is per *buffer*; two views on one buffer share one history. Tabs/panes are plain Zinc UI (already demonstrated by
  zed-editor `Tabs.tsx`, `workspace.ts`), so a pane tree component is app-level (1-2 ew), not engine work.
- Minimal display of large files: rope + line index means opening 100 MB is a read into chunks plus a newline scan;
  render never touches non-visible text. Memory ~1x file size. Mark **read-only huge-file mode** (no tree-sitter above a
  size limit, e.g. 5 MB, as Helix/Zed do [bg]).

### 3.5 IME/composition, bidi, shaping, clipboard, a11y

- **IME**: needs HAL work. SDL3 delivers `SDL_EVENT_TEXT_EDITING` (preedit text + selection start/length) [bg]; add
  `HalInput.preedit` and `hal_text_input` rect updates per caret move (already partly there, `hal_sdl.cpp:415`). The
  editor holds a "composition range" not committed to the rope, drawn underlined; commit replaces it via one transaction.
  On the wasm HAL: `compositionstart/update/end` on a hidden textarea [bg]. Tapes must gain a preedit field to stay replayable
  (`docs/guide/06-testing.md:132` lists gaps). ~1.5-2 ew.
- **Shaping and bidi**: the rasterizer has no GSUB/GPOS/bidi (see 1.3). Options ranked: (1) monospace Latin/code
  editing only, document the limit (MVP); (2) add kerning-free **fallback fonts + grapheme clustering + double-width CJK**
  (`wcwidth`-style tables, ~1 ew); (3) vendor HarfBuzz (MIT, C++, ~1.5 MB source; add to a `zinc:text` plugin, `sources`)
  plus a UBA implementation (`fribidi` is LGPL, so prefer ICU-less small implementation or SheenBidi, Apache-2.0 [bg]) for
  real bidi/Indic/Arabic; needs the rasterizer to draw by glyph id instead of codepoint (`ttf.cpp:236 slot(cp)`). 6-10 ew and
  is the biggest single unknown; do not put it on the critical path for a *code* editor.
- **Clipboard**: text works; add multi-cursor clipboard (one entry per cursor pasted round-robin, VS Code/Helix behaviour),
  line-wise cut/copy when selection empty, and `paste-and-indent`. Rich types unnecessary. 0.5 ew.
- **Accessibility**: AccessKit C API [web] would give AT-SPI/UIA/NSAccessibility; needs a semantic tree from `ui.ts` nodes,
  which does not exist. Post-1.0 milestone; state as a known gap.

## 4. Syntax highlighting

### 4.1 Recommendation: tree-sitter as a vendored native plugin `zinc:treesitter`, lexer fallback stays

- `plugins/treesitter/plugin.json` `kind: module`, `sources: ["vendor/lib/src/lib.c", ...]` (tree-sitter's runtime
  compiles as one C file, `lib/src/lib.c` [bg]) plus per-language grammar folders compiled only if imported/configured
  (`plugins.treesitter.languages: ["typescript","json","css","cpp","rust","markdown"]` via plugin `options`, which C++ sees
  as `ZP_TREESITTER_*` defines, `docs/plugins.md` table). C sources go in the separate C static library (documented for `.c`).
- Native spec (`native/treesitter.spec.ts` + `treesitter.<target>.cpp`): `createParser(lang)`, `parse(handle, chunks)`,
  `edit(handle, startByte, oldEndByte, newEndByte, points...)`, `reparse(handle)`, `query(handle, name, byteRange)` returning a
  flat `i32[]` of `[captureId, startByte, endByte]` for a byte range (visible rows only) so the boundary is crossed once per
  frame; tree lifetime as an opaque resource (spec ABI supports resources, `docs/engines.md`).
- Fit with existing constraints: MIT license (compatible; add to `docs/licenses.md`); C only, no allocator surprises (tree-sitter
  lets you override `ts_set_allocator`; hook to `zrt` heap); no exceptions/RTTI issue since C. Excluded targets: esp32/ps1/ps2
  (like `zinc:socket` `requires`), sim via **web-tree-sitter (wasm)** or node `tree-sitter` in a `.sim.ts` twin. [inferred]
- Highlighting pipeline: on transaction, translate ChangeSet to `TSInputEdit`s, `ts_tree_edit`, schedule reparse (timer, ~1-5 ms
  budgets; parse with `TSParseOptions` progress callback for cancellation [bg]), then run the highlight query over the visible
  byte range plus margin; cache capture runs per line, invalidate through `ts_tree_get_changed_ranges`. Injections
  (markdown fences, TSX-in-HTML, CSS-in-JS) as in Zed `SyntaxMap` [web]; do in a second pass.
- Same tree drives: fold ranges, bracket matching, indent (`indents.scm`), "select parent node", comment markers by language
  config, sticky scroll, outline.
- Grammar distribution: each `parser.c` is large; committing generated parsers for ~8 languages adds tens of MB to the repo
  [bg, estimate]; alternative: build them lazily on `zinc plugins` install into a cache. Zinc grammar itself: TypeScript grammar
  covers `.ts/.tsx` (Zinc source is TypeScript), so no new grammar for the Zinc language. [inferred]

### 4.2 Alternatives

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| Keep and extend the hand-written incremental lexer (`syntax.ts`, per-line state) | Already works, ~0 native code, incremental by construction if restarted from edited line with cached states | Lexical only: no folds, brackets by structure, scopes, indent queries; every new language = hand-work | Keep as fallback and for huge files; fix "recompute from line 0" (`document.ts:52`) by keeping `states[]` and re-lexing from the edited line until state converges |
| TextMate grammars (Oniguruma regex, `.tmLanguage.json`) | Huge grammar ecosystem (VS Code themes/grammars) | Needs Oniguruma (C, BSD) + scope engine; line-by-line, not incremental past line state; no tree | Only if VS Code theme compatibility is required; skip |
| Semantic tokens (LSP) | Correct by type info | Latency, needs a server; overlay only | Add as overlay layer after LSP (5.4) |
| Tree-sitter | Incremental, error tolerant, queries for folds/indents/brackets, many grammars | Native dep, grammar size, query tuning | **Chosen** |

Effort: plugin + TS/JSON/CSS/C++/Rust/Markdown highlighting, folds, brackets: 4-6 ew. Injections + indent queries: +2 ew.

## 5. LSP client

### 5.1 Placement: `zinc:lsp` as pure Zinc TS on top of `zinc:process` and `zinc:socket`

No new native code is required for stdio transport [verified from 1.5], only hardening (5.5). Layers:

1. **Transport**: `StdioTransport(cmd, args, {cwd, env})` using `proc.spawn` + `onData`; `TcpTransport(host, port)` using
   `zinc:socket connect`. Interface `{send(bytes), onBytes(cb), close()}`.
2. **Framing**: parse `Content-Length: N\r\n\r\n` + N **bytes**. `onData` delivers chunks of UTF-8 without splitting sequences
   (`docs/plugins/process.md:30`) but as strings, so length must be computed in UTF-8 bytes (`String.bytes()` exists in the
   runtime, `gfx.cpp:796` uses `s.bytes()`; expose it or add a byte-level API). Robust rule: keep an accumulation buffer of
   bytes, never trust `string.length`. Add `p.onBytes(cb: (Uint8Array)=>void)` to `zinc:process` if strings prove lossy.
3. **JSON-RPC**: request ids, pending map `id -> Promise`, notifications, server-to-client requests (`workspace/configuration`,
   `client/registerCapability`, `window/workDoneProgress/create`, `workspace/applyEdit`) with mandatory replies, `$/cancelRequest`,
   `$/progress`. Requires a JSON parser/serializer: `JSON.parse/stringify` availability in Zinc for dynamic shapes must be
   confirmed (`docs/guide/09-web-apis.md`; `DYN` types exist in `hir.ts:30`). [inferred; not verified]
4. **Session**: capability negotiation, `initialize`/`initialized`, `shutdown`/`exit`, restart with backoff, one server per
   (language, workspace root), multi-root via `workspaceFolders` and `didChangeWorkspaceFolders`.
5. **Document sync**: ChangeSet -> `contentChanges` incremental ranges (needs the rope's utf16 line/col summaries), version
   counters, debounce for diagnostics-relevant flushes; request `positionEncoding: utf-8` when the server supports it (clangd,
   rust-analyzer do [bg]) and fall back to utf-16.
6. **Feature adapters** (each maps a response into editor concepts):

| Capability | Editor surface | Notes |
|---|---|---|
| publishDiagnostics / pull diagnostics | squiggle layer, gutter, problems panel | anchor ranges, remap through later ChangeSets |
| completion (+resolve, trigger chars, snippets) | popup component, snippet transaction | `insertTextFormat=2`, `additionalTextEdits` |
| hover, signatureHelp | tooltip overlay (`overlays.tsx` in kit) | Markdown subset renderer needed |
| definition / typeDefinition / references / rename (prepareRename, WorkspaceEdit) | goto (opens tab), references panel, multi-file edit transaction | WorkspaceEdit across unopened files needs an edit-on-disk path with undo |
| formatting, rangeFormatting, onTypeFormatting | transaction from TextEdit[] | apply as a single undo step, mapped selections |
| codeAction | lightbulb menu | commands executed via `workspace/executeCommand` |
| semanticTokens (full/delta/range) | highlight overlay above tree-sitter | legend decoding, delta apply |
| inlayHint | display-map inlay transform | needs layout support (3.4) |
| documentHighlight, documentSymbol, foldingRange, selectionRange | occurrences layer, outline, fold source | |
| workspace symbols, file watching | palette, `didChangeWatchedFiles` | needs an fs watcher; today `zinc:fs` has none [unverified] |

### 5.2 Spawning servers

- typescript-language-server: `npx typescript-language-server --stdio` (or a resolved `node_modules/.bin`), TS needs a
  `tsserver.path` (`initializationOptions`); clangd: `clangd` (uses `compile_commands.json`; Zinc's build dir may need to
  emit one for Zinc C++ output), rust-analyzer: `rust-analyzer` with **no** args; pyright `pyright-langserver --stdio` [web].
- Server table in a JSON config (`languages.json`): `{id, extensions, command, args, rootMarkers, initializationOptions}`.
- Environment: the app runs sandbox-free on host targets (`docs/guide/08-security.md` threat model: process plugin is
  program-trusted). Editor should spawn servers with `cwd` = workspace root, stderr routed to an output panel.
- Requirement: `PATH` resolution of `node`/`npx` for GUI-launched apps on macOS, where PATH is minimal; add an
  explicit login-shell `PATH` probe (`sh -lc 'echo $PATH'`). [bg/inferred]

### 5.3 Async I/O integration with the event loop

Events are delivered from the loop by `zrt::Poller` (`docs/plugins/process.md`; `docs/plugins.md` "Core services") so LSP
callbacks run on the UI thread between frames. Rules: parse large JSON responses (completion lists, semantic tokens can be
MBs) in slices or on a worker if Zinc offers threads (not documented; else chunk with `queueMicrotask`/timers so a 5 MB reply
does not drop frames); cap message size; never block the frame on a response, use debounced requests with cancellation
(generation counters, as `zed-editor/src/app/tools.ts` already does for `check`). [verified pattern]

### 5.4 ABI additions and hardening needed (list)

1. `zinc:process`: non-blocking `write` with a queue and a `onDrain`/writable event (today it blocks at 64 KiB,
   `docs/plugins/process.md:54`); LSP `didOpen` of a large file can exceed 64 KiB while the server is busy (deadlock with a
   server that writes while we write, a classic).
2. Binary-safe I/O: `onBytes`/`writeBytes` (or expose UTF-8 byte length and byte slicing).
3. Optional PTY for the terminal panel: `spawnPty(cmd, args, {cols, rows})` with `openpty`/`forkpty`, resize (`TIOCSWINSZ`),
   plus a VT100/xterm parser (the panel today only strips SGR, `tools.ts:parseAnsi`). 3-4 ew (parser is the bulk; no PTY code
   found: `grep -rn "pty|forkpty|openpty" runtime plugins` empty).
4. Process exit/`kill(SIGTERM)` semantics and process group kill (language servers spawn children; `kill` must reach them).
5. A file watcher (FSEvents/inotify) for `didChangeWatchedFiles`, and a `zinc:fs` recursive glob/ignore-aware walk for workspace
   symbols. [inferred; unverified whether `zinc:fs` has these]
6. Environment/`PATH` inheritance as above.
7. `String.bytes()`/`byteAt`/`sliceBytes` in the string API used by the rope and by framing.

### 5.5 Effort

MVP client (stdio, framing, sync, diagnostics, hover, definition, completion popup, formatting): **4-5 ew**; the rest
(references, rename, code actions, signature help, semantic tokens, inlay hints, folding/selection ranges, workspace folders,
progress UI): **+5-6 ew**; ABI hardening: **+1.5 ew**. Test with a scripted fake server (Zinc program that speaks LSP on
stdio) plus a real `typescript-language-server` in CI-optional tests.

## 6. A Zinc language server (`zinc lsp`)

### 6.1 Feasibility

Because Zinc source is TypeScript and Zinc's semantic model is the **TS checker plus Zinc lowering** (1.6), the cheapest
correct design is layered [inferred]:

1. **Base layer = the TypeScript language service** (not tsserver as a process): construct `ts.createLanguageService`
   with a `LanguageServiceHost` reusing the options and module resolution from `frontend.ts` (`STD_MODULES`, plugin `paths`,
   `PLATFORM_FILE` virtual file, `webGlobals`, `platformVariant`, `frontend.ts:128-208`). That yields hover with inferred
   types, definitions (including through `zinc:*` modules to `lib/std/*.ts` and `plugins/*/index.ts`), references, rename,
   completion, signature help, quick info, organize imports, semantic classification, inlay hints, for free and incrementally.
   This is more capable than building a checker from `sema.ts`; the frontend exports only the whole-program `loadProgram`
   today, so refactor it to expose the compiler options/host builder (small, ~0.5 ew).
2. **Zinc overlay diagnostics**: run `Sema` (Z-codes: unsupported types/ops for the selected profile, integer/float
   profile warnings, `Z5003/Z5004/Z5005` plugin/target availability) on demand for the entry graph and merge with TS
   diagnostics. Needs: (a) `Sema` collecting **all** `ZincError`s instead of throwing on the first (`guard`, `cli.ts:225`;
   HIR already converts errors inside statements/expressions to `opaque` nodes with the code text, `hir.ts:177,329`, so
   partial recovery exists) (b) diagnostics with ranges (`SourceLocation` has only start; `hir.location()` uses `getStart`;
   add `end`). (c) Per-target profile choice: `zinc.json` `targets` / initializationOptions `target`, `profile`, `noFloat`.
3. **Zinc-specific intelligence**: hover shows the *lowered* type (numeric kind: `f64`/`i32`/`fx12`, from `NumKind` `sema.ts`/`hir.ts:6`,
   `infer.ts` `zinc infer --write` proposes numeric annotations); code actions "apply inferred numeric types"; go-to-definition
   through **declaration identities** (used by the VM linker, `docs/engines.md` "Declaration identities") for re-exports and
   aliases; virtual JSX/CSS class diagnostics (`css.ts`, `styles.ts`, `ui-style.ts`: unknown utility classes such as
   `w-[300]`), plugin-aware completion of `zinc:*` module imports, `zinc.json` schema validation.
4. **Transport**: implement in Node (the compiler is Node TS: `compiler/bin/zinc.mjs`), using `vscode-languageserver` (MIT) or a
   200-line hand-rolled JSON-RPC over stdio; entry `zinc lsp --stdio` added next to `cmd === 'ui'` in `cli.ts:1073`.
   Incremental document sync with the language service host `getScriptSnapshot` on unsaved buffers (virtual files).
5. Performance: TS language service holds one program per project; Zinc's std `ui.ts` is 2843 lines and the kit is large, so the
   first check is seconds, later ones incremental. `@typescript/typescript6` is what the compiler uses (`package.json`);
   the dev dependency is TS 7 (native port). Pick one version and keep the LS on the same one the compiler uses so hover
   and diagnostics agree with `zinc check`. [verified from package.json / inferred for the risk]

Alternative: forward to `typescript-language-server` and add only the overlay (Z-code diagnostics + hover addendum) as a
second server (LSP allows several servers per language; the editor merges). Simpler and immediately usable in the
editor, but loses Zinc target awareness in module resolution. Suggested as **step 0** of the LSP milestone: it proves the
client with a real server while `zinc lsp` is written.

### 6.2 Effort

`zinc lsp` with TS language service base + target-aware diagnostics (first error only): **2-3 ew**; collect-all Sema
diagnostics with ranges: **+2 ew**; Zinc-specific hover/actions/CSS-class intelligence: **+2 ew**. Written in Node, works in
VS Code and Zed too, which is a distribution win independent of the Zinc editor.

## 7. DAP and terminal

- **Terminal panel**: exists for output (`Terminal.tsx`, 47 lines). A real terminal needs PTY + VT parser + cell grid renderer
  (fixed-width cell canvas, scrollback ring, selection, bracketed paste, alt screen). 4-6 ew total. Recommend deferring behind
  LSP: run tasks still work with today's panel.
- **DAP** [bg]: JSON-RPC-like protocol with the same `Content-Length` framing, so the LSP transport/framing layer is reused
  as is; adapters (`codelldb`, `lldb-dap`, `node --inspect` bridges). UI needs breakpoints gutter (a `MARK_GUTTER` kind exists,
  `ui.ts:1558`), variables/callstack panels. Zinc VM/QuickJS engines have no debug protocol; the native engine could be debugged
  through lldb/dap. 4-6 ew after the LSP is stable; low priority. Do not design it now beyond keeping the transport generic.

## 8. Test strategy

Assets that already exist [verified]: headless deterministic replay with virtual clock, `.out` goldens per resolution/number
profile, pixel tests, test hooks for pointer/keys/typed text, conformance for `code_editor.tsx`, fuzz directory, and the
engines matrix (`tests/engines/run.mjs`) to check the same app on native/VM/QuickJS.

Add:
1. **Model tests without UI**: rope vs naive string differential fuzz (random edits, offsets, utf16 counts, non-ASCII),
   ChangeSet compose/invert/map properties, undo tree walk = original, multi-range command results (`tests/editor/*.ts`).
   Run on sim + native + VM to catch engine drift.
2. **Scripted key tapes** for behaviours: multi-cursor typing, paste round-robin, auto-indent, comment toggle, snippet tabstops,
   fold/unfold, find/replace, undo-redo across cursors; assert on `getValue`/`selections` dumps in `.out`.
3. **Pixel tests** for caret/selection/gutter/squiggle rendering at 1x and 2x (existing `--pixels`).
4. **IME**: extend `HalInput` with preedit so tapes can replay composition; until then unit-test the composition state machine.
5. **LSP**: a fake server (Zinc or node) with recorded transcripts (request/response fixtures) to verify framing, id
   correlation, cancellation, position mapping through concurrent edits; contract tests against real `typescript-language-server`
   opt-in; golden tests for `zinc lsp` responses (hover/definition/diagnostics JSON) run in `zinc test`.
6. **Perf gates**: extend `ZINC_DEMO=scroll` to a 100 MB file, 10k-line files, and multi-cursor (1000 cursors) typing; record in
   `docs/reports` next to existing engine JSON reports; budgets: keystroke <= 2 ms at 100k lines, open 100 MB <= 1 s, scroll >= display rate.
7. **Tree-sitter**: golden highlight dumps per language for fixtures; incremental vs full reparse equivalence fuzz.

## 9. Roadmap and estimates [inferred]

| # | Milestone | Content | Effort |
|---|---|---|---|
| M1 | Editing core (MVP) | rope + summaries, Selection/ChangeSet/Transaction, undo tree, single view, layout cache (mono fast path), keep lexer highlighting, clipboard, tabs/panes reuse from zed-editor; new `EDITOR` node in ui.ts; migration of zed-editor to it | 7-9 ew |
| M2 | Multi-cursor and editing commands | multi-selection commands, add-cursor-above/below/next-occurrence, column select, comment toggle, auto-indent/auto-close/surround, snippets, find/replace with regex, folding (indent-based), sticky selection UX | 4-5 ew |
| M3 | Tree-sitter | `zinc:treesitter` plugin, incremental parse, highlight/fold/bracket/indent queries, 6 languages, sim twin | 5-7 ew |
| M4 | LSP client | see 5.5; stdio first, typescript-language-server, then clangd/rust-analyzer | 9-12 ew (incl. ABI hardening) |
| M5 | Zinc LSP | see 6.2 | 4-7 ew |
| M6 | IME + polish | preedit in HAL and editor, minimap on tree tokens, huge-file mode, split panes polish, a11y decision | 3-4 ew |
| M7 | Terminal (PTY) / DAP | 4-6 ew each | optional |
| M8 | Shaping/bidi | HarfBuzz plugin + bidi + fallback fonts | 6-10 ew, optional |

Total for a solid, LSP-capable code editor (M1-M5 + M6): about **32-44 ew**, roughly 8-10 months for one engineer, 4-5 months
for two after M1. Milestones M2 and M3 can run in parallel after M1; M4 needs M1's utf16 position mapping; M5 is independent of
the editor (Node only) and can start on day one as a standalone tool for VS Code/Zed, which de-risks the demand side.

### Minimal "real editor" bar (my proposal)

Not a real editor until all of these hold: multiple cursors/selections and every command applies to all; undo tree with
selection restore; open and scroll a 50 MB file without stalls; regex find/replace; auto-indent, comment toggle, bracket
match/auto-close; incremental structural highlighting; at least one language server giving diagnostics, completion,
hover and go-to-definition; keyboard-only operation; correct IME commit and composition display; unsaved-changes safety.
Everything else (bidi shaping, DAP, PTY terminal, a11y tree, minimap) is v2.

## 10. Risks

1. **Zinc string/UTF-8 cost model**: any accidental `charCodeAt` on large strings is O(n) (`docs/ui.md:66`). Mitigation: byte-oriented
   rope API, lint rule/test that fails when the core imports string index helpers on documents.
2. **Text shaping absence** (`ttf.cpp`) limits i18n; monospace Latin/CJK-width is fine for code, but users editing Arabic/Hebrew
   comments will see wrong output. Document; plan M8.
3. **Native plugin size and portability**: grammar C sources are large; build times on `rpi1`; excluded targets need graceful
   errors (Z5003).
4. **Engine parity**: VM/QuickJS UI is "pending" (`docs/engines.md`), so the editor only targets the native engine + sim at
   first; running the core-model tests on all engines keeps the door open.
5. **`zinc:process` write blocking** can freeze the UI during large `didOpen` to a busy server; must be fixed before LSP ships.
6. **LSP position encoding mismatches** (UTF-16 vs bytes) are the number one source of bugs; keep utf16/byte/line summaries in
   the rope and fuzz conversions.
7. **Scope creep in a `ui.ts` of 2.8k lines**: keep the new editor in separate files (`lib/std/editor/*`) and a narrow glue API.
8. **Zinc LSP** depends on Sema recovery (first-error-only today) and on TS version alignment (`@typescript/typescript6` vs TS 7).
9. **Terminal/DAP** are large, separable projects; do not let them block editing/LSP.
10. **Unverified in this study**: whether Zinc has a regex engine, `JSON.parse` into dynamic values with acceptable speed,
    threads/workers, an fs watcher, byte-level string APIs. Each needs a 1-day spike before M1/M4 estimates are firm.

## Sources

Repo files (all under `/Users/mowmow/Lab/zinc`): `lib/std/ui.ts`, `docs/ui.md`, `examples/zed-editor/README.md` and `src/**`,
`tests/conformance/code_editor.tsx`, `runtime/ttf.cpp`, `runtime/gfx.cpp`, `targets/macos/hal_sdl.cpp`, `docs/plugins.md`,
`docs/plugins/process.md`, `docs/plugins/socket.md`, `docs/engines.md`, `docs/guide/06-testing.md`, `docs/reports/PERF.md`,
`docs/reports/gpu-renderer-design.md`, `compiler/src/{frontend,sema,hir,cli}.ts`, `package.json`.

Web (fetched or searched 2026-09-30):
- Zed Decoded: rope and SumTree: https://zed.dev/blog/zed-decoded-rope-sumtree
- Zed architecture summaries: https://deepwiki.com/zed-industries/zed/4.3-buffer-architecture , https://deepwiki.com/zed-industries/zed/13.2-crdt-and-buffer-synchronization
- VS Code text buffer reimplementation (piece tree): https://code.visualstudio.com/blogs/2018/03/23/text-buffer-reimplementation
- CodeMirror 6 system guide: https://codemirror.net/docs/guide/
- xi-editor retrospective: https://raphlinus.github.io/xi/2020/06/27/xi-retrospective.html
- Xi rope science / CRDT: https://xi-editor.io/docs/rope_science_08.html
- Helix architecture: https://github.com/helix-editor/helix/blob/master/docs/architecture.md ; tree-house: https://github.com/helix-editor/tree-house
- Kakoune/Helix selection model: https://phaazon.net/blog/more-hindsight-vim-helix-kakoune
- Lapce architecture: https://docs.lapce.dev/development/architecture
- Tree-sitter: https://github.com/tree-sitter/tree-sitter
- LSP 3.17 specification: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/
- Server flags (rust-analyzer vs --stdio): https://github.com/hyperion2144/dsh-hashline-edittool/issues/135 (single issue source, confirm)
- AccessKit: https://accesskit.dev/how-it-works/ , https://crates.io/crates/accesskit
