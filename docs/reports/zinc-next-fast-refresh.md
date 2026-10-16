# Fast Refresh for `zinc dev` (ZN-742): research and design

Status: research, 2026-10-16. Recommends the design below and a split of ZN-742 into three subtasks. Built so far: steps 1
and 2 (ZN-742.01, ZN-742.02), see §9 and §10.

Owner request: on a save, recompile only what changed and swap it into the running program (same process, window and
DevTools); components re-render while the state of the modules that did not change is kept; React Native's rules for
modules that export other values; a full restart with a one-line reason when a swap is impossible; none of the machinery
in `zinc run`, `zinc build`, `export` or `pack`.

## 1. Today's `zinc dev` loop

- `dev()` in `next/src/cli_core.cpp:1976-2087`. It sets `ZINC_RUN=interp` (1977): `zinc dev` always interprets, so AOT
  is never involved. It polls the tree every 40 ms (D31, `snapshot()` 1871-1890) and waits 30 ms for the save to settle (2058).
- On a code change it runs `zinc check --check` **in a second process** (2063-2065). On success it kills the process
  group and starts a new `zinc run` (`startProgram` 2002-2027). On failure it kills the program and runs a generated
  red-box program (`redBoxSource` 1957-1963). The red box therefore loses the state too.
- The inspector: `inspectEntry` (1966-1974) writes `build/.zinc-dev/main.ts` = `import 'zinc:devtools'; import '<entry>';`.
  That file is the one injection point `zinc dev` has today. The inspector is Zinc code (`plugins/devtools`) and
  restarts with the program.
- The asset swap (ZN-450, D97 `docs/reports/zinc-next-decisions.md:167`): a socketpair, with the child's end passed as
  `ZINC_DEV_FD` (2010-2020). `reloadAssets` (1922-1955) sends `asset <kind> <size> <name>` + bytes + `end`. In the child,
  `assets_host.cpp` reads it (`onDevRead` 186-206). The listener only starts on the first call into the asset manager
  (`ready()` 229, `devListen` 211-221), so a program that loads no asset has no dev channel. On a device, fd 3 carries the
  same messages (`src/agent/dev.cpp:85`).
- ZN-141 notes: about 55 ms from save to new process, and "not kept: module state across reloads".
  `docs/dev-mode.md` still describes the **prototype's** dlopen hot reload (`runtime/dev_host.cpp`), not Next.
- The message "cache changed: src/pages/home.tsx" comes from the ZBC cache of interpreted runs (ZN-415,
  `next/src/main.cpp:886`, store at 1874). It caches a whole program by its inputs, not by module.

Measured (desktop-app template, 41 files, 924 functions, warm, this Mac): one compile takes **470 ms**: parse 112, check
114, lower 55, optimise 102, reference counting 46, emit 43. A save today pays it twice: `zinc check`, then the child's
own compile.

## 2. How the interpreter compiles and loads modules

There is **no per-module unit after the frontend**. Everything is compiled as one closed world.

- `loadProgram` merges every file into one `Ast` (`frontend/modules.h:2-5`). `Ast::modules` keeps one `ModuleInfo` per
  file (path, statements, imports, exports: `ast.h:136-152`). `Ast::root` holds every module's statements in
  initialisation order (`modules.cpp:1883`). The prelude goes first, and a generated `__runLoop();` is appended **to the
  last module's statements** (`modules.cpp:3271-3283`).
- Imports are bound **by symbol identity**: the importer's name maps to the exporter's symbol (`check.cpp:4634-4646`).
  After lowering, an imported `let`/`const` is the same global slot, and an imported function is a direct `Call` by index.
  These are live bindings with no indirection.
- IR (`ir/ir.h:91-134`): one module with `functions[0] = @main` (all top-level code), a single `globals` table (named by
  the bare symbol name, `lower.cpp:749`), closed-world `classes` with dense vtables by selector, `strings`, and natives.
  Closures are classes: captures become fields and the body becomes a `call` method (`lower.cpp:388-524`). Lambda classes
  are named `lambda<N>` by a program-wide counter (`lower.cpp:502`), so one added lambda renames every later one.
  Generics are monomorphised. Small functions are inlined across modules unless `debug` (`opt.cpp:571`).
- ZBC (`zbc/zbc.h:87-99`) has the same shape. There are no module records, init functions or symbolic link table.
- Runtime (`rt/rt.h:85-245`): `Machine` holds `funcs`, `classes` (`ClassRT` with `vtable` of `const Func*`), `globals` and
  `strConsts`. Every object holds a `const ClassRT*` (`Obj::cls`). The interpreter keeps a **registry of every live
  object** (`allocated`, `registry = true` except AOT, 197-201). `runModuleHooked` (`rt/program.cpp:14-37`) runs main,
  then releases the globals.
- Host callbacks find their method **by selector name at call time** (`rtcalls.cpp:814`, `machine.cpp:370`), and the
  callback table holds `Obj*` handles. They cache no `Func*` and no selector id. The one global is `gMachine`
  (`rtcalls.cpp:700`, set at 800).
- The frame loop is Zinc code: main → `__runLoop` → `__frameHook` = `__gfxLoop`, which loops over `__host_gfxPoll`
  (`modules.cpp:60-95`, 2636-2719). Between two frames the VM stack therefore holds main, `__runLoop` and `__gfxLoop`,
  all running old code that addresses globals and functions by index.

Consequences: you cannot swap one module's functions into the running `Machine`. Indices of functions, classes,
selectors, globals and strings all move when any file changes, inlined bodies cross module lines, and the live frames
below the frame boundary run old code. What does stay stable across two compiles is **names**: a file path plus a
declaration name gives a durable key.

## 3. JSX components and `zinc:ui/solid`

- `<Home />` lowers to a **direct call**: `_append(v, Home({ ...props }))` (`jsx.cpp:1096`). React mode uses a thunk:
  `_rc(v, () => Home(...), 'Home', key)`. A component is a function that returns a node id (`i32`).
- `lib/std/solid.ts`: `Computation` has an owner tree (15-28). `newRoot`, `rendered` and `dispose` (35-63) are exactly
  what a proxy needs. `render()` (258) runs `app()` with **no owner** (top-level computations have no parent), and
  `createRoot` is `fn()` (125), so today a mounted tree cannot be disposed as a whole.
- A solid-refresh style proxy can wrap **the call expression the lowering already emits**:
  `_hotC('src/pages/home.tsx', () => Home({...}))` creates a fragment and a root, renders the thunk under it, and records
  the instance. A swap disposes the root and runs the thunk again under a new root with the same owner. The thunk
  re-evaluates the props expression exactly as emitted, so the proxy does not care whether props are values or getters
  (the parallel ZN work on prop reactivity).

## 4. QuickJS and AOT

- QuickJS (`src/qjs/qjs.cpp:415-453`) runs real ES modules through `JS_SetModuleLoaderFunc`. A module cannot be
  instantiated twice under one name, and importers hold live bindings to the old record, so a Vite-style HMR there needs
  a module transform. For this task, `zinc dev` on `--engine quickjs` falls back to restart with one line, and the gap is
  documented.
- AOT: `zinc dev` never compiles (it forces `ZINC_RUN=interp`), so there is nothing to swap. State it in the help and
  the doc.

## 5. Keeping it out of other builds

- One switch: `ZINC_HOT=1`, set only by `zinc dev` on its child (or `zinc run --hot` on explicit request). The compile
  then lowers in **hot mode**. Without it the frontend, lowering and ZBC are byte-for-byte today's.
- `import.meta.hot` (Vite and webpack spelling) gets one new member in the parser (`parser.cpp:652-654` accepts url,
  dirname and filename today). Outside hot mode the loader **deletes every `if (import.meta.hot) {...}` statement** (as
  Vite tree-shakes it) and any other use is `null`. That way `lib/std/solid.ts` can carry its hot code and a non-dev
  build gets none of it.
- The Zinc side of the machinery is `lib/std/hot.ts` (`zinc:hot`), added by the loader in hot mode only. The C++ side is
  `next/src/dev/hot.cpp`, linked into the `zinc` CLI only, never into the runtime or host libraries that AOT programs
  link. The one shared touch is a "keep the window" flag in the gfx host's finish path.
- What a T0 test can check (`tests/t0/hot_off.sh`):
  1. a fixture with an `if (import.meta.hot) {...}` block compiles (`--emit=zbc`) to the same bytes as the fixture
     without it;
  2. the non-hot ZBC of the desktop-app has no `zinc:hot` function or class and no per-module init function, and the hot
     one has them (so the test cannot pass vacuously);
  3. `nm` and `strings` of a `zinc build` binary show no `zn::dev::hot` symbol and no `zinc:hot`.

## 6. External references (rules taken)

- **React Native Fast Refresh / react-refresh**: a module that exports only components is a boundary. It is
  re-executed and its components re-render with their local state kept (hooks). A module that exports anything else
  is re-executed **with its importers**, walking up to boundaries. Reaching a module outside the React tree means a
  full reload. A syntax error shows a redbox and the next good save recovers without a reload. Effects re-run.
  `isReactRefreshBoundary` checks that every export is a component (capitalised function).
- **Vite `import.meta.hot`**: `accept()` makes a module a self-accepting boundary, and `accept(cb)` passes the new
  module to `cb`. `dispose(cb)` runs before the module is replaced, with `data` carried over. `on('vite:beforeUpdate' |
  'vite:afterUpdate')` and `invalidate()`. Propagation walks importers to an accepting module, else full reload. The
  `if (import.meta.hot)` blocks are removed in production.
- **solid-refresh**: each component is wrapped in a proxy (a memo over a signal that holds the current
  implementation). An update sets the signal, the old subtree is disposed and the new one rendered untracked. The
  edited component's local signals are reset, while its parents and siblings keep theirs.
- **Flutter hot reload** (the same problem in a typed VM): it patches the code, keeps the heap and all globals, checks
  class shapes (a changed shape cannot reload), and re-runs `build()`. That is the closest model to what Zinc can do.

## 7. Design

### Options (RULES §4: fit x3, perf x3, size x2, maintainability x2, licence x2, portability x1, effort x1)

| Option | fit | perf | size | maint | lic | port | effort | total |
|---|---|---|---|---|---|---|---|---|
| **A. Recompile the whole program in the child, keep the heap: remap live objects and globals to the new code by stable keys, re-run the inits of the re-evaluated modules** | 5 | 4 | 5 | 4 | 5 | 5 | 3 | **63** |
| B. Separate compilation per module with a symbolic linker (true incremental swap) | 5 | 5 | 3 | 2 | 5 | 4 | 1 | 55 |
| C. Stable ids in lowering and emit, then patch the running `Machine` in place under live frames | 4 | 5 | 4 | 1 | 5 | 5 | 1 | 53 |
| D. Restart the process, carry serialised signals of unchanged modules | 2 | 3 | 5 | 4 | 5 | 5 | 4 | 52 |
| E. New `Machine` in the same process and window, restore serialised signals | 3 | 4 | 4 | 3 | 5 | 5 | 2 | 52 |

The other options fall short for these reasons:

- B breaks the closed-world design (layouts, dense vtables, monomorphisation, cross-module inlining) and adds a second
  compile pipeline.
- C has to keep old frames running old code consistent with renumbered globals.
- D fails AC1: the process id and the window change.
- D and E keep only serialisable signals. `state.ts` also holds `router = new Router()`, so its page signal would come
  back out of step with the router.

A keeps **whole module instances** as RN and Flutter do. It is memory safe because every live object is checked
before the swap.

### A in detail

1. **Hot compile mode** (lowering, `ZINC_HOT=1`):
   - Each module's top-level statements become an init function `@init:<path>`.
   - `main` calls the init functions in order, then `__runLoop` (no longer appended to the entry's statements).
   - A side table of stable **keys**, kept in memory and never encoded:
     - classes: `<file>::<name><type args>`;
     - lambda classes: `<file>#<source offset><type args>`;
     - top-level function thunks: `<file>::thunk:<fn>`;
     - globals: `<file>::<name>`;
     - built-in arrays, maps and sets: their type.
   - Inlining and the optimiser stay as they are: all code is replaced at once, so nothing has to stay in step.
2. **Plan** (on a save, after the child's in-process recompile; the LSP already re-runs `loadProgram` in one process):
   - Changed files are found by text hash against the previous compile.
   - The **re-evaluation set** follows RN's rules:
     - a changed module whose exports are all capitalised functions returning a node is a boundary;
     - any other changed module adds its project importers, recursively;
     - a kept global whose type changed adds its module.
   - **Restart with a reason** when:
     - a re-evaluated module has a top-level expression statement other than `render()`/`renderWindow()` and no
       `import.meta.hot.dispose`;
     - the set of plugins or host modules changed, or a plugin's native code changed;
     - `zinc.json` changed;
     - the baked fonts and images (`bakeResources`, `main.cpp:383`) differ;
     - the program has no frame loop;
     - the engine is QuickJS.
   - A compile error leaves the program running and shows the red box in-process as a `zinc:gfx` overlay (`overlay()`
     exists, `modules.cpp:96-100`). The next good save removes it and swaps.
3. **Safe point.** `ZINC_HOT_FD` is a second socketpair. The asset one (D97) stays untouched, because it only listens
   once the asset manager starts. In hot mode the child reads it from the start on the libuv loop:
   - `zinc dev` writes `reload`;
   - the child compiles and plans;
   - if a swap is possible, it raises the gfx quit flag with *keep the window*;
   - `__gfxLoop` breaks, `__runLoop` and main return, and **the VM stack is empty**.
4. **Swap** (`src/dev/hot.cpp`, a `runModuleHooked` variant that loops):
   1. Call `zinc:hot`'s `beforeUpdate(mods)` in the old code. This runs each re-evaluated module's `dispose` hooks, and
      `zinc:ui/solid` disposes the component instances of those modules.
   2. Release the old globals of re-evaluated modules.
   3. Load the new module into a new `Machine` and **check every live object in the registry**. Its class key must map
      to a new class with the same fields (names, types, reference flags). Objects of a changed file's lambdas must be
      gone. Otherwise restart with the reason, for example: "a callback of src/pages/home.tsx is still alive (a timer?)".
   4. Move the registry over, rewrite each `Obj::cls`, copy the kept globals by key, and re-point `gMachine`.
   5. Run the new `@init:` functions of the set in order, then `afterUpdate(mods)` (new code: Solid re-renders, then the
      `accept` callbacks run).
   6. Run the new `__runLoop`.
   7. Reply `ok <ms> <modules>` to `zinc dev`, or `restart <reason>`, which `zinc dev` turns into today's restart.
5. **`import.meta.hot`** (typed, minimal): `accept(cb?)`, `dispose(cb)`, `on('beforeUpdate' | 'afterUpdate', cb)`.
   `data` and `invalidate` are left out: the modules that did not change keep their state anyway (a later.md line).
6. **`zinc:ui/solid`**:
   - Inside an `if (import.meta.hot)` block, `render()` keeps a root owner and its mount. When the entry is
     re-evaluated, a second `render()` disposes the old tree and fills the same root instead of mounting twice.
   - In hot mode only, the JSX lowering wraps calls to components declared in **project** files (not kit components) in
     `_hotC(file, () => Comp(...))`. `beforeUpdate` disposes the instances of the updated files. `afterUpdate` renders
     them again under their old owner. Instances leave the list through `onCleanup`.
   - Parents and siblings keep their local state, as with solid-refresh. React mode (`_rc`) re-mounts from the root.
7. **`zinc dev`**:
   - When the child is alive and announced `hot ready`, a code save sends `reload` and prints the reply as one line:
     `zinc dev: v1 refreshed src/pages/home.tsx (310 ms after the save)` or `zinc dev: restart: <reason>`.
   - The separate `zinc check` process goes, which saves about 230 ms per save.
   - No answer within 5 s means a restart.
   - `--device` and QuickJS keep today's path.

### Steps in order

1. Hot lowering:
   - `@init:` functions;
   - keys side table;
   - `__runLoop` moved to `main` in hot mode;
   - `import.meta.hot` in the parser and loader, with elision outside hot mode;
   - `lib/std/hot.ts`;
   - T0 `hot_off.sh`.
2. In-process recompile:
   - the plan (re-evaluation set, restart reasons);
   - `ZINC_HOT_FD`;
   - loop exit that keeps the window;
   - transplant with the live-object check;
   - init re-run;
   - `zinc dev` protocol and fallback lines;
   - headless test.
3. Solid:
   - `render()` root;
   - `_hotC` proxies in hot-mode JSX;
   - in-process red-box overlay;
   - desktop-app T1;
   - `docs/dev-mode.md` rewritten for Next and `zinc help dev`;
   - perf log line.

### Risks

- **A second in-process compile** may trip static state in the CLI (`gSources`, the native provider, the loader stage,
  static `deque`s in `modules.cpp`). The LSP shows that `loadProgram` and the check can run again. The T0 test compiles
  twice. Fallback: let `zinc dev` compile in a fresh process and send the ZBC plus the key table.
- **Key collisions**: two files with the same class name, or generic instances. Keys carry the file and the type
  arguments. A collision must make the swap refuse (restart), never map wrongly.
- **Host state outside the heap**: UI nodes, listeners, images and native plugin handles. Disposal must free a
  component's listeners, or the live-object check will refuse every swap. That refusal is safe, and it points at a leak
  to fix in `lib/std/ui.ts`.
- **Baked resources**: a new text-size class can change the baked fonts. Those saves restart until resources can be
  installed again live (later.md).
- **Latency** is about 0.4 s, dominated by recompiling all 41 files including the kits. Later work, measured first:
  a parse cache for unchanged files, `ZN_NO_OPT` in hot mode, and compiling on a thread while frames continue.
- Top-level effects in re-evaluated modules (menus, intervals) cannot be undone without `dispose`, so the rule
  restarts. Editing the template's `main.tsx` (the `installMenus` call) therefore restarts. That matches RN, where
  `index.js` reloads.

### Test plan (acceptance criteria)

- **AC4: T0 `hot_off.sh`**, as in §5. It covers elision, the absence of the machinery in non-hot ZBC, its presence in
  hot ZBC, and no symbol in a built binary.
- **AC2 and AC5 (interpreter): T0/T1 `hot_swap.sh`**, headless. It drives the child over a Python socketpair (or
  through `zinc dev` itself) on a tiny gfx and Solid fixture whose state module prints its signals. It checks:
  - a component edit replies `ok` and the printed state is unchanged;
  - an edit to a non-component module re-evaluates its importers (their init prints);
  - a top-level effect without `dispose` replies `restart` with the reason;
  - a syntax error replies `error` with the program still running, and the fix replies `ok`;
  - a plugin edit replies `restart`.
- **AC1: T1 `fast_refresh.sh`**, modelled on `tests/t1/asset_reload.sh`:
  - `zinc new desktop-app` runs under `zinc dev` with `ZINC_INPUT` going to Settings and typing a name;
  - the test edits `src/pages/home.tsx`;
  - the dev log shows `refreshed` and no `v2 started`, with the same pid;
  - a later frame shows the new text (`tools/scene-texts` on a scene dump, or pixels) on the page that was open, with
    the typed name.
- **AC3**: the fixture uses `import.meta.hot.dispose` and `accept`, and Solid's re-render is proven by AC1.
- **AC5**: the save-to-frame time from the dev log goes to `docs/reports/zinc-next-perf.md`. The QuickJS and AOT
  statement goes in the help and the doc.

## 8. Split

ZN-742 is size-L and does not fit one session. Split it with `New-task: split ZN-742`, each subtask holding its own
criteria:

- **ZN-742.01** Hot compile mode:
  - per-module init functions;
  - stable keys;
  - `import.meta.hot` with elision outside hot mode;
  - `zinc:hot` skeleton;
  - AC #4 (`hot_off.sh`).
- **ZN-742.02** In-process swap on the interpreter:
  - the plan with RN's rules and the restart reasons;
  - `ZINC_HOT_FD`;
  - loop exit that keeps the window;
  - heap transplant with the live-object check;
  - init re-run;
  - `zinc dev` protocol;
  - AC #2 and the interpreter half of #5 (`hot_swap.sh`).
- **ZN-742.03** UI and docs:
  - `zinc:ui/solid` hooks (`render` root, `_hotC` proxies);
  - in-process red box;
  - desktop-app T1;
  - `docs/dev-mode.md` and `zinc help dev`;
  - perf log and the QuickJS/AOT statement;
  - AC #1, #3 and the rest of #5.

Lines for `next/backlog/later.md`:

- ZN-742: Fast Refresh on QuickJS, through a module transform with Vite-style bindings.
- ZN-742: Fast Refresh over `zinc dev --device`, sending the ZBC instead of `reload`.
- ZN-742: `import.meta.hot.data` and `invalidate`.
- ZN-742: re-install baked fonts and images live instead of restarting.
- ZN-742: a parse cache for unchanged files and compiling on a thread, to bring a save under 200 ms.
- ZN-742: Fast Refresh for React-mode components (`_rc`) beyond the root re-mount.

## 9. Built: the hot compile mode (ZN-742.01)

- **The switch.** `ZINC_HOT=1` (read by `loadChecked` in `next/src/main.cpp`, part of the build-cache signature) turns on hot mode.
  Nothing sets it yet: `zinc dev` will set it on its child in ZN-742.02, together with the swap. `zinc run`, `build`, `export` and
  `pack` never set it.
- **`import.meta.hot`.** The parser accepts it and leaves the marker `__meta_hot`. `hotMeta` in `frontend/modules.cpp` handles it
  per file, right after parsing:
  - outside hot mode, a statement that only runs with it (`if (import.meta.hot) ...`, `import.meta.hot?.x()`, `import.meta.hot && ...`)
    is turned into empty nodes with everything in it, so the prelude scans do not see its timers or promises; another use is `null`;
  - in hot mode the `if` test is `true` and every other use is `__zinc_hot('<path>')`, bound by an import the loader adds to the module.
- **`zinc:hot`.** `lib/std/hot.ts` is loaded first in hot mode only. It holds the `HotModule` records (`accept`, `dispose`, `on`) and
  `beforeUpdate(modules)` and `afterUpdate(modules)` for the swap. `lib/zinc.d.ts` types `ImportMeta.hot` for editors and the oracle.
- **The lowering** (`ir/lower.cpp`, when `Ast::hotModule` is set):
  - every module's statements become `@init:<path>`;
  - main runs the prelude, then calls the inits in order, then `__runLoop()`; the loader still appends that call to the last module
    for the checker (`Ast::runLoop`), and the lowering moves it into main;
  - every top-level variable is a global, so the state outlives the init and has a key;
  - the inits and zinc:hot's functions are `Function::entry`, so they are never inlined or dropped.
- **Keys** (`ir.h`, `Module::hot`): `Function::key`, `Class::key` and `Global::key` move with their entries through the optimiser, so
  index `i` of the optimised module is index `i` of the ZBC. `ZN_DUMP_HOT_KEYS=<file>` writes them in that order. On the desktop-app
  (2755 keys), no class or global key is shared, and a lambda added to one file moves no key of another file.
  - Lambdas are `<path>#<offset>`, plus ` in <instance>` for a lambda cloned into a generic instance (its name and signature, without
    the type id of a generated helper), plus `.n` when a desugaring made several at one offset (an async method).
  - Records and interfaces take the file of the declaration that names them.
- **Proof** (`tests/t0/hot_off.sh`, 6 s):
  - the non-hot ZBC of a program with hot blocks equals the ZBC of the program without them;
  - the non-hot ZBC of the desktop-app has no `@init:` and no zinc:hot function, and the hot one has both;
  - the hot keys are unique and stable;
  - a hot run prints the same as a non-hot one;
  - a `zinc build` binary has no HMR string or symbol.
- **Non-hot output is unchanged.** 48 programs (the conformance corpus, hero, breakout, nuxt-ui, lang, modules-showcase,
  rn-showcase and the desktop-app) compile to byte-identical ZBC before and after. The hot desktop-app renders the same frame 10 as
  the non-hot one.

## 10. Built: the swap on the interpreter (ZN-742.02)

- **The channel.** `zinc dev` gives its child `ZINC_HOT=1` and `ZINC_HOT_FD` (a second socketpair beside the asset one of D97). The child
  runs through `next/src/dev/hot.cpp` (linked into the `zinc` command line only). At the end of its first frame it says `hot ready`; a
  program without a frame loop never does, and a save restarts it as before.
- **A save.** `zinc dev` sends `reload` when only modules changed (`.ts`, `.tsx`, `.js`...); any other file (`zinc.json`, a plugin's native
  code, an image under a non-packed `assets/`) restarts with `zinc dev: restart: <file> changed (not a module)`. At the end of the next frame
  the child compiles the program again in-process, with stderr captured, and answers one line:
  - `ok <ms> <modules>`, sent at the end of the first frame of the new code: `zinc dev: v1 refreshed src/labels.ts (126 ms after the save)`;
  - `restart <reason>`: `zinc dev: restart: <reason>`, then a new version without `zinc check` (the child compiled it);
  - `error` + the diagnostics + `end`: the red box, as a failed check gives it (the in-process overlay is ZN-742.03).
  No answer within 5 s restarts. The separate `zinc check` process only runs when no hot version is running (after a red box or an exit).
- **The plan** (React Native's rules). The changed modules are the project modules whose text hash differs. Each changed module runs again;
  one that exports anything but components (capitalised functions) and does not call `import.meta.hot.accept` also re-runs its importers, up
  to such a boundary or the entry. Restart reasons, decided before anything moves: other native exports; a library module (`zinc:*`, `lib/`,
  `plugins/`) or the engine's prelude added, removed or different; other baked fonts and images; a re-run module with a top-level
  expression statement (other than `render`, `renderWindow`, `onFrame`, which replace what the previous run set up, and `import.meta.hot`
  calls) and no `import.meta.hot.dispose`, named by file, line and text.
- **The safe point.** The child calls `zn::host::pauseLoop()`: the frame ends, `__gfxStep` reports a quit, `__host_gfxFinish` keeps the
  window, `__runLoop` and main return. `__runLoop` is a hot-mode entry (never inlined), so the new one can be called by key.
- **The swap**, with the VM stack empty:
  1. zinc:hot's `beforeUpdate(modules)` in the old code (the dispose hooks);
  2. the globals of the re-run modules, and those the new code does not have, are released;
  3. each live object's class must have a class with the same key and shape in the new code (kind, field names and types, element types,
     references compared through the key map); a key two classes share is never mapped. Objects of a closure of a changed file (its key is
     an offset in the file) become *zombies*: a class appended to the new ZBC with the old fields and every method a trap;
  4. the other globals keep their values by key; a global outside the re-run modules that the old code did not have restarts;
  5. a fresh `Machine` loads the new ZBC; its code, classes, string constants and globals move into the running machine, every object takes
     its new class, and the callbacks native modules hold find their `call` again (`rt::rebindCallbacks`);
  6. the inits of the re-run modules run in order, then `afterUpdate(modules)`; a zombie still alive then (or called) restarts:
     `a callback of src/x.ts from before the change is still alive (a timer or a listener? undo it in import.meta.hot.dispose)`;
  7. the new `__runLoop` starts the frame loop again in the same window.
  Past step 1 the old program cannot go on, so a failure there answers `restart` and the child exits.
- **Off elsewhere.** `zinc run`, `build`, `export` and `pack` never set `ZINC_HOT_FD`; without it a `ZINC_HOT=1` run is an ordinary run
  (`hot_off`). The hot child skips the ZBC cache: the keys come from a compile.
- **Proof** (`tests/t1/hot_swap.sh`, headless, 6 s): a gfx program refreshes a non-component module edit with the same pid, re-runs its
  importer and keeps the frame counter of the module it did not touch; a top-level `console.log` without dispose and a `zinc.json` edit
  restart with their reason; a type error shows the red box and the fix starts a new version; a Solid program whose entry re-runs mounts its
  root again with its store's count kept. `dev_mode` and `asset_reload` pass (the latter accepts a refresh for its code edit).
- **Measured** (this Mac, other builds running): save to the first frame of the new code 114-126 ms on the two-file gfx fixture, 330-400 ms
  on the Solid fixture (zinc:ui compiled again), 180-300 ms on the game-2d template (each of its files refreshes in place).
- **What the desktop-app template does today**, and what ZN-742.03 has to change: an edit to `src/pages/home.tsx` (a boundary) restarts
  because the mounted tree still holds closures of the old file (`_hotC` proxies will dispose them in `beforeUpdate`); `src/state.ts`
  (`setColorMode(...)` at the top level) and `src/main.tsx` (`installMenus(APP_NAME)`) restart for their top-level effects, and
  `src/router.ts` restarts through its importer `state.ts`. A second `render()` mounts a new root and leaves the old tree's nodes and
  computations alive (harmless, a leak per refresh): the `render()` root of §7.6 replaces it.
