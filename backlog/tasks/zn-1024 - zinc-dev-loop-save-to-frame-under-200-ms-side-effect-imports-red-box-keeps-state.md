---
id: ZN-1024
title: >-
  zinc dev loop: save-to-frame under 200 ms, side-effect imports, red box keeps
  state
status: Backlog
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
<!-- SECTION:NOTES:END -->
