---
id: ZN-1024
title: >-
  zinc dev loop: save-to-frame under 200 ms, side-effect imports, red box keeps
  state
status: In Progress
assignee:
  - '@parallel'
created_date: '2026-11-07 16:36'
updated_date: '2026-11-08 23:23'
labels:
  - dev
  - perf
  - size-M
milestone: m-20
dependencies: []
ordinal: 7400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Compile a save on a thread while frames continue (they pause 100-450 ms), a parse cache for unchanged files, side-effect-only imports in the importer graph, `import.meta.hot` blocks type-checked, and a red box drawn over the paused program so a typo keeps the state.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-742: a parse cache for unchanged files and compiling on a thread, to bring a save under 200 ms.
- ZN-742: `if (import.meta.hot)` blocks are not type-checked by `zinc check` or the LSP (removed before checking outside hot mode); check them in hot mode too, or warn.
- ZN-742.02: compile a save on a thread while frames continue (frames pause 100-450 ms during the in-process compile today).
- ZN-742.02: side-effect-only imports (`import './x'`) are not in the importer graph, so editing such a module does not re-run its importer.
- ZN-742: the in-process red box: keep the paused program and draw the diagnostics over its window, so a typo does not lose the state.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 a save in `zinc dev` of hero shows the new frame in under 200 ms (measured, logged)
- [x] #2 editing `import "./x"` re-runs its importer
- [x] #3 a type error draws the diagnostics over the window and the state survives the fix
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research (sonnet web search, 2026-11-09): Vite HMR keeps an importers set per module and re-runs importers up to a boundary; the overlay is drawn over the live page and a good update clears it (https://vite.dev/guide/api-hmr.html). Flutter rejects a reload that does not compile, keeps the running app and its state and shows the error (https://docs.flutter.dev/tools/hot-reload). Overlapping saves during a rebuild duplicate stateful modules (https://github.com/vitejs/vite/issues/2255): tag a compile and never run two. A content hash, not mtime, settles a parse cache (esbuild, swc, Bun). FSEvents watches directories; editors save by rename; a short trailing debounce (20-50 ms) fits a 200 ms budget.

Done (ZN-1024, commit below):
- #2 `import './x'` is in the importer graph: ModuleInfo.effectImports (frontend/ast.h, modules.cpp), hot::describe adds them to the module's imports. Proof: a program whose main imports './fx' (fx pushes a note into notes.ts at its init, no top-level statement); editing fx.ts gives `v1 refreshed src/fx.ts (93 ms)` and main prints `one!an1n2` (it ran again). The develop binary prints `one!an1` (main did not run again): negative control done.
- #3 a compile error in hot mode no longer kills the child: it sends the diagnostics to zinc dev (printed as before) and draws the red box over itself (runtime/gfx.cpp red_box, now shared by crash_screen and the new compile_screen: "Zinc: compile error", "Fix it and save: the program keeps its state"); the program keeps running underneath; the next save that compiles swaps in and clears the box. Proof: `red box over v1, its state kept until the fix (54 ms)`, a shot under the box is the red box (title, the Z0103 diagnostic, hint), then `v1 refreshed src/labels.ts (92 ms)`, same pid, the frame counter went on (120000 -> 160000).
- The save compiles on a pthread of its own (64 MB stack: the parser and checker recurse) while the frames go on: one enum Reload {Idle, Compiling, Swapping} changed by reloadTo, which aborts on an illegal transition; the main thread polls the job at each frame end, plans and pauses the loop for the swap once it is done; run() joins the thread before it returns. Hero, a shot every 20 frames during a save: largest gap between shots 44 ms while the save compiled (the frames paused for the whole compile before). The compile's stderr capture (dup2) now also catches what the program writes meanwhile: the non-step lines are written out again after a compile that succeeded.
- Decision (record as D-number): the program under the red box keeps running (not paused), as Flutter and Vite do: input and timers go on, state is never at risk. The original later.md line said "keep the paused program"; running is simpler and keeps animations alive.

Open: #1 (hero save-to-frame under 200 ms). Measured 1180-1220 ms after the save (3 saves of src/components/Icon.tsx, headless, with the inspector; load ~3 from another tree building: indicative). The compile of hero (102 files, 2086 functions) breaks down as: read and parse 370-390 ms (of which: the resolver's own work 165 (file system: canonical paths, candidates), file reads 54, JSX lowering 28, class tags 38, parse 35), check 56, lower 72, optimise 180-200, reference counting 115, emit ZBC 80, bake fonts and images 110-160. A parse cache alone saves ~35 ms: the cost is spread over the whole pipeline, which recompiles the whole program at each save. Next steps toward 200 ms, in order of gain: (1) skip or memo the bake in a hot recompile (key it on what res::bake extracts from the sources - sizes, characters, faces - not on the whole texts, and cache the per-file regex scan by content: ~110-160 ms); (2) parallel reference counting and optimise per function where they are intra-procedural (~150 ms on 4 threads); (3) an in-process cache of the resolver's file-system answers and file reads by (path, mtime, size) (~200 ms); (4) skip `optimise` in hot mode (~190 ms; slower dev interpreter: a decision). Real measurement on a quiet machine: `scripts in the notes`: zinc dev of a copy of examples/hero, append a comment to src/components/Icon.tsx three times, read `refreshed ... (N ms after the save)`.

Tests written (not run, T1): tests/t1/hot_swap.sh (1b: the side-effect import re-runs main; 3: red box over v3 with its pixel, the fix swaps in, same pid, frames go on), tests/t1/dev_mode.sh (step 2 expects `red box over v2`; its pixel check moved to hot_swap). Ran: tests/run --only hot_off (pass).

later.md lines (for the coordinator):
- ZN-1024: `if (import.meta.hot)` blocks are still not type-checked by `zinc check` or the LSP outside hot mode: check them in hot mode too, or warn.
- ZN-1024: the bake key (assets::bake) reads and hashes every font file of lib/fonts at each compile; key the fonts by (path, mtime, size).

Proposed tests: `tests/run --only hot_swap` (side-effect import, red box keeps state, its pixel; ~15 s, <300 MB), `tests/run --only dev_mode` (~20 s), `tests/run --only fast_refresh` (the Solid/desktop-app refresh still swaps; ~20 s).

Session 2026-11-09 (criterion #1, worktree agent). Research (sonnet web search): esbuild caches each file-system answer the resolver used (reads, directory listings, misses) and dirties only that answer (https://github.com/evanw/esbuild/issues/1409); (mtime, size) is racy within the timestamp granularity: version-control tools and Go re-hash entries younger than a couple of seconds (https://golang.org/issue/58571); key on (path, mtime_ns, size, inode) and let the content decide; editors save by rename (new inode); parallel per-function passes stay deterministic when workers touch only their own function and shared tables are filled before or merged after in source order; dev builds skip optimisation elsewhere (-O0, V8 Ignition) but rc insertion stays.

Measure in one process: `ZN_HOT_RECOMPILE=n zinc --emit=hot <entry> <out>` compiles n more times as zinc dev's saves do and fails (exit 4) when a recompile gives other bytes; tests/t0/hot_recompile.sh runs it on hero and the desktop-app template (one thread vs several, cold vs warm). Profile (sample, 12 recompiles of hero, ~780 ms each): read and parse 205 (jsxClassTags 32, plugin discovery 24, lex + parse 78, lowerJsx 30), check 56, lower 72, optimise 180 (a copy of every function per inline round: 27), rc 120 (Rc::block + liveness 100, per function), emit 80 (FnEmitter::run), bake 2 on an asset-cache hit but 130 on a miss, and every save of a new text misses (the key hashes the whole texts).

Step 1 (perf(ir): copy only the inlinable callees): inlineRound copied every function each round; now only the callees it can inline. Optimise 181 -> 155 ms on hero (back to back, load ~3), same bytes.

Step 2 (perf(ir): reference counting on several threads): ir::parallelFor (at most 4 threads, half the cores, halved when the load average is above half the cores; ZN_IR_THREADS=n) runs Rc per function; the two types Rc interns (void, the Error reference) are interned before, so the workers only read the module. Reference counting 121 -> 43 ms on hero (back to back, load ~3), bytes identical to the one-thread compile.

Step 3 (perf(res): key the bake on what it takes from the sources): res::scan returns the sizes, characters, faces and font families bake uses; the asset cache key hashes that scan instead of every source text (key version "font-baker 2"), and each text's scan is memoised while it stays the same (the scans of the last call kept, the rest dropped). zinc dev of hero, three saves of a new comment in Icon.tsx: bake 137 -> 3.5 ms, save-to-frame 1063-1089 -> 925-980 ms (back to back, load ~3.4). Blob identical to the old baker's with ZINC_NO_CACHE=1.

Step 4 (perf(ir): run the per-function optimiser passes on several threads): ZINC_LOG=build=debug now times each pass; on hero inline round 1 46, cse 48, hoist constants 20, thread branches 16 ms were per function and read only m.types (and the round's snapshot): they run through parallelFor, whose threads now get 64 MB stacks (cse's walk recurses along a chain of blocks, as on zinc dev's compile thread). Optimise 147-152 -> 76-78 ms (inline 22, cse 20, hoist 7, thread 5), a recompile of hero 662-691 -> 590-616 ms, same bytes as the one-thread compile (back to back, load ~2.5).

Step 5 (perf(frontend): keep the parses of unchanged files): the loader's parses (files, the web-globals reparse, the prelude) go through parseKept, keyed by the whole text, kept for two loads (what the last load did not use is dropped at the next); the nodes view the memo's own copy of the text and are rebased onto the caller's on the way out (a node handle keeps the key's address from one generation to the next). Read and parse 200-213 -> 165-178 ms, a recompile of hero 601 -> 571 ms, same bytes (back to back, load ~2.9). The copy of the nodes out of the memo costs about as much as half the parse: appending them straight into the program's AST would save another ~10 ms.

Step 6 (perf(frontend): scan unchanged texts once for icons and class tags): two std::regex scans ran over whole texts at every load: zinc:lucide's icon names over every .ts/.tsx of the project (23 ms on hero) and jsxClassTags' relative imports, with jsxFunctionNames of each imported .tsx (21 ms). Their results are kept by text (TextMemo, the same two-load rotation). Read and parse 165-178 -> 114-122 ms, a recompile of hero 554 -> 501-526 ms, same bytes (back to back, load ~2).

Step 7 (perf(plugins): look for the plugins once per compile): every native module of a compile listed and read all the plugins again (gNativeProvider, gNativeLive, gNativePreferred, notePlugins: discoverPlugins each time), and pluginForModule generated every spec it read. main.cpp keeps the compile's discovery (gCompilePlugins, reset at the start of each compile by installNativeProvider, so a plugin added between two saves is found); pluginForModule keeps the module each spec declares by path and text. Read and parse 114-122 -> 99-108 ms, a recompile of hero 501-524 -> 483-502 ms (back to back, load ~2.5), same bytes.
<!-- SECTION:NOTES:END -->
