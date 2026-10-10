# Working on Zinc

Zinc is a strict, typed subset of TypeScript for apps, games, services and boards: one program runs on a desktop, a Raspberry Pi, an ESP32, a console or the web.
The repository holds two generations:

- **The prototype** (Node + TypeScript): `compiler/` compiles the subset to C++17 against the `runtime/` (zrt) with one HAL per target; `sim/` is the Node oracle that every target must match byte for byte. It is the **specification**: when behaviour is unclear, read its code and run it (`node compiler/bin/zinc.mjs ...`). Touch `compiler/` only for fixes.
- **Zinc Next** (`next/`, C++20): the new engine (frontend, typed SSA IR, ZBC bytecode, interpreter, AOT to C++, QuickJS engine, graphics host, toolchain manager). The goal: **every demo of the prototype runs unchanged** on it (interpreter, AOT, `--engine quickjs`), with the plugins working, while the engine stays agnostic, pluggable, readable and fast. All current work happens here.

Binding rules: `next/RULES.md` (never stop, simulators for hardware, proven libraries, decisions), `next/ARCHITECTURE.md` (layout, dependency direction), `next/TESTING.md` (tiers, what to run). State of the work: `next/RESUME.md` (short, overwritten at the end of each session).

## Repository map

| Path | What it holds |
|---|---|
| `next/` | Zinc Next: `src/` (frontend, ir, zbc, vm, aot, rt, host, qjs, gl, text, res, tc, dev, sim, lsp, prof, native), `include/zn/` (the only place a constant or an operation is defined), `third_party/` (vendored libraries), `tools/`, `tests/`, `backlog/`, `corpus/` (frozen corpus), `firmware/esp32`, `app/atelier` |
| `lib/` | The standard library written in Zinc/TS (`lib/std`, the UI kits `lib/std/kit`, `lib/std/nuxt`, `zinc.d.ts`); shared by both engines |
| `plugins/` | 33 plugins (`plugin.json` + Zinc code + native code): system, video, sqlite, three, 3d, canvas2d, lottie, svg, socket, process, displays, webview... |
| `examples/` | The demos that must run unchanged (hero, breakout, nuxt-ui, rn-showcase, rn-port, three, maps, video, zed-editor...) |
| `templates/` | Project templates used by `zinc new` |
| `targets/` | Per-target HALs of the prototype and `capabilities.json` (what each profile offers) |
| `boards/` | Board presets (ESP32 panels, Scroll pHAT) |
| `tests/` | The prototype's corpus: `conformance/` (programs + golden outputs, `.f32.out`, `.fx12.out`), `bench/kernels/` |
| `compiler/`, `runtime/`, `sim/`, `docker/`, `scripts/` | The prototype toolchain |
| `docs/` | Guides, plugin and target docs, reports, decisions (see below) |
| `apps/studio`, `integrations/`, `site/`, `research/` | ZincStudio, Figma and reMarkable integrations, the web site, the VM prototype |

## Build, run, test

```sh
cd next
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release     # once
tools/build zinc                                    # after a change: only the target you need (load-aware, see below)
build/zinc run ../examples/hero                     # run a program or project (--interp, --engine quickjs, --profile esp32)
build/zinc doctor                                   # engine, renderer, pinned tools, host tools, plugins
tests/run --only <name>                             # one test; tests/run --changed: the tests mapped to your changes
```

Main `zinc` commands (table in `next/src/cli_core.cpp`): `run`, `build` (`--target` cross builds with the pinned zig), `check`, `test`, `new`/`init`, `dev` (watch + DevTools inspector), `export`, `deploy`, `pack`/`fuse` (.zapp), `publish`/`update-app`, `add`/`remove`/`install`/`plugins`/`trust` (signed plugin index), `capture`, `bench`, `toolchain`, `explain`, `lsp`, `flash`.
Useful environment: `ZINC_HEADLESS=1`, `ZINC_DETERMINISTIC=1`, `ZINC_FRAMES=n`, `ZINC_SHOT=file.png`, `ZINC_SCALE=1..4`, `ZINC_HOME` (toolchains and caches, default `~/.zinc`), `ZN_TRAP_TRACE=1`, `ZN_DUMP_JSX=<name>`.

## Development workflow: the backlog

The work is a backlog of precise tasks managed with **Backlog.md** (`backlog` CLI, config `backlog.config.yml`, files in `next/backlog/`).

- Tasks: `next/backlog/tasks/zn-NNN - Title.md` (description, acceptance criteria, notes). Statuses: Backlog, Ready, In Progress, Review, Done. One task In Progress at a time per working tree (several only as described in "Several tasks at once").
- Milestones `next/backlog/milestones/` (m-0 to m-25, e.g. M17 UI style system, M19 packaging, M21 performance, M22 games, M23 handhelds).
- Order of work: `next/backlog/priority.json` (groups chosen by the owner); `next/tools/next-task` prints the task to do (`--list N`, `--why`). Labels: `size-S/M/L`, topics (`perf`, `ui`...), `parked` (needs a board, Windows or a paid account; ordinal 90000+, skipped), `needs-board`.
- `next/tools/status`: next tasks, progress per milestone, uncommitted work. `next/tools/tasks-import file.json`: bulk task creation with dependencies by key (`next/backlog/keys.json`).
- Commands: `backlog task <id> --plain`, `backlog task edit <id> -s "In Progress"`, `--check-ac <n>`, `--notes`/`--append-notes`, `backlog task create "title" -p <parent> --ac ... -m <milestone> -l <labels>`.
- A session: `/loop /zn-start` takes the next task, works it start to end, then `/zn-end` (tick the criteria on real test output, Done or follow-up tasks, notes, commit, `RESUME.md`, next task). `next/.paused` stops the loop.
- Commits: English, conventional (`type(scope): imperative description`, 72 chars max), no co-author, explicit paths (never `git add .`), the task file in the same commit as its code. Never commit someone else's uncommitted changes. Pushing is the owner's step. The `commit-msg` hook in `.githooks/` refuses a message that breaks these rules (type, 72 chars, English, final period, co-author): fix the message, never pass `--no-verify`. Enable it once per clone: `git config core.hooksPath .githooks` (worktrees share the setting).

## Several tasks at once: one worktree per agent

Independent tasks can be worked in parallel: a coordinator session hands them out, and each agent works one task in its own git worktree and branch, so no two agents share a working tree, a build directory or an index.

- **Choose** with `next/tools/next-task --list 10`: tasks with no dependency between them that touch different modules (their labels, `next/tests/affected.json`). Two tasks in the shared core (IR, runtime, raster, layout, text, `lib/std/ui.ts`) never run together. Two building agents at most beside the loop on the development Mac (12 threads); agents that do not build (research, documents, a fix in a test) do not count.
- **Claim**: before the agents start, the coordinator sets the assignee of every task it hands out (`backlog task edit <id> -a @parallel`) and commits that on main: `next/tools/next-task` skips a task that has an assignee, so the loop on main never takes it. A task that is given back gets `assignee: []` again in its file.
- **Chains**: small tasks of one module go to one agent, in order, one commit per task: one worktree, one warm build, no conflict between them.
- **The base**: a new worktree may start from `origin/main`, which is behind while the owner has not pushed. The agent's first command is `git reset --hard main` (the local main), before it reads or builds anything.
- **The agent** works its task as `/zn-start <id>` says, in its worktree, and commits code, test and task file on its branch. It leaves alone the files every task writes: `next/RESUME.md`, `next/backlog/priority.json`, `next/backlog/keys.json`, `docs/reports/zinc-next-decisions.md`, `docs/reports/zinc-next-perf.md`. It creates no task and no decision number (ids are allocated per tree and would collide): follow-up tasks, decisions and measured numbers go in the task notes and in its final report.
- **The coordinator** integrates one branch at a time on main (`git cherry-pick main..<branch>`, linear history), builds once, runs the tests of the integrated tasks, then writes what the agents left: decision records, the performance log, the follow-up tasks, `next/RESUME.md`. Then `git worktree remove <path>` and `git branch -D <branch>`.
- **A conflict** at integration is resolved by the coordinator when it is a few lines; otherwise the task goes back to an agent in a fresh worktree of the updated main.
- **Builds** go through `next/tools/build [target...]` in every tree, never a bare `cmake --build -jN`: one job per physical core, and make starts no new job while the load average is above the core count (the limit of this Mac is heat, not memory: above a load of 6 the CPU is slowed so much that the total work done drops), so trees that build at once share the cores instead of piling up, and a new build directory is configured with ccache (paths relative to the repository), so a fresh worktree reuses what another tree compiled. A task that changes only a test, a tool or a document builds nothing: it runs its test against the main tree's binary (`ZINC=<main>/next/build/zinc`, read-only).
- **No synthetic load**: never start `yes` loops, stress runs or a second full build to "test under load" while other trees work; say what was not proven instead.
- **Tests**: an agent runs its task's own test. Tests that open a window, bind a fixed port or measure time (benchmarks, `system_instance`, the macOS window tests) run only after integration, alone: a number measured while other agents build is not valid.

## Decide alone: the owner is not at the keyboard (owner, 2026-10-10)

Never ask the owner to choose, confirm or approve a design or technical decision: nobody is there to answer, and a question stops the loop.

- Think it through, then look for the answer: the docs (`next/RULES.md`, `docs/reports/`, the decision records in `docs/reports/zinc-next-decisions.md`, the task and its linked reports), the prototype's code and behaviour, and how the reference tools the owner chose solve it (React Native and Expo, Nuxt UI, Tauri and Electron, three.js, the libraries named in `docs/reports/parity/04-library-choices.md`...).
- Pick the best option (score it as `next/RULES.md` §4 says when it matters), write the choice and why in the task notes or a decision record, and go on. A reversible choice is made at once.
- Only an irreversible or outward-facing step (publishing, pushing, deleting data, spending money, sending a message) waits for the owner: do everything up to it and leave the exact command in the task notes.

## Focus on the development platform; cross-platform comes last (owner, 2026-10-10)

For now the engine is built and tested on the development Mac only. Do as many backlog tasks as possible there.

- No builds or tests for ARM, Raspberry Pi, ESP32, Linux, the handhelds or the CHIP during a task (no `--target` cross builds, no QEMU, no `cross*` tests). Keep the code portable, but do not prove it on those targets now.
- A task that touches a cross target: implement it, write its test, and move the cross-target verification into a follow-up task whose title names the target (it then lands in the deferred group of `next/backlog/priority.json`).
- The cross-platform pass (the deferred group, the handheld and board milestones, their tests) is done at the end, as one phase.

## Move fast: finish tasks, prove only what changed (owner, 2026-10-10)

The goal of a session is progress on the backlog: finish tasks, improve and complete the engine. Tests exist to prove a change, not to fill the session.

- Before running a test, ask what it proves. If your change cannot make it fail, do not run it.
- End of a task: the task's own test (`next/tests/run --only <name>`) and the few tests that cover the files you touched. Run `tests/run --changed` only when it maps to a handful of tests; when it falls back to the whole tier, pick the relevant tests yourself.
- End-to-end runs (full T1, T2, the demos, `examples_all`, the WebGL conformance, benchmarks, fuzz) belong to large milestones or to changes in the shared core (IR, runtime, raster, layout, text). Start them in the background and keep working; never wait for them.
- A command that runs for more than a minute is a background job. Do not re-run a suite that already passed for code you did not touch, and do not re-verify what you already checked in the session.
- Known failures recorded in `next/RESUME.md` and the backlog (machine, GPU or architecture specific) are not investigated again during an unrelated task.
- Build only the target you need (`tools/build zinc`), never the whole tree for a change in one library.
- Be critical and pragmatic: one targeted check that can fail beats a sweep of 300 tests that cannot.

## Tests

- `next/tests/<tier>/<name>.sh`, given `$ZINC`: T0 (seconds, the stage touched), T1 (end of a task, the feature's demo), T2 (milestone: whole corpus, interpreter vs AOT vs frozen output, benchmarks). Runner: `next/tests/run [--tier t0|t1|t2] [--only name] [--changed | --changed-from ref]`, one line per test, details in `next/.logs/`.
- `next/tests/affected.json`: which tests cover which paths (add a mapping with a new module or test). Goldens: `next/tests/golden/` (outputs, checker cases, pixel frames of the prototype in `examples/proto` with `manifest.json`).
- A new module ships a T0 test; a behaviour change a golden or an expectation test; a bug fix a regression test.

## Tools (`next/tools/`)

- Backlog and session: `next-task`, `status`, `tasks-import`, `usage`.
- Comparison and correctness: `diff-matrix` (interpreter vs AOT vs frozen), `oracle` (reference tsc), `test262`, `dts-walk`, `abi-check`, `example-output`, `examples-status`, `layout-fuzz`, `layout-fixtures`, `webgl-conformance`, `three-compare`, `fuzz` (libFuzzer).
- Pixels: `proto-capture` (prototype pixel goldens: `compare`, `--canary`, `--all`), `pngdiff`, `pixel-compare`, `glcompare`, `style-neutrality`, `contrast-check`, `oklab-tints`; `cdp.py` drives headless Chrome.
- Performance: `bench`, `bench-gate` (fails above 15%), `bench-m1`, `bench-m4`, `bench-layout`, `bench-render`, `resmon` (CPU, RSS, energy); log every number in `docs/reports/zinc-next-perf.md`.
- Packaging and distribution: `package`, `sign-macos`, `appimage`, `build-wasm`, `build-esp32-core`, `index-repo` (signed TUF index), `tlog`, `plugin-split`, `gh-org-setup`.

## Documentation and references

- Decisions: `docs/reports/zinc-next-decisions.md` (D1 to D50 and on: read before deciding again), `docs/decisions/` (the prototype's ADRs). Design: `docs/reports/zinc-next-design.md`.
- Parity audit, from which the backlog comes: `docs/reports/parity/01-language-cli-std.md`, `02-examples.md`, `03-plugins-targets.md`, `04-library-choices.md` (scored library choices).
- Performance log: `docs/reports/zinc-next-perf.md`. Module reports: `docs/reports/zinc-next-*.md`. Research: `docs/reports/research-2026-09-30/`, `docs/reports/hardware/` (handhelds, CHIP, Pi, PocketJS), `docs/reports/games/`.
- User docs: `docs/guide/01..09`, `docs/ui.md`, `docs/ui-kit.md`, `docs/nuxt-ui.md`, `docs/react-native.md`, `docs/plugins/*.md`, `docs/targets/*.md`.
- Reference products the owner models Zinc on: React Native and Yoga (`docs/react-native.md`, `rn-port-spike.md`, `layout-engines.md`), Expo, Nuxt UI 4 (`docs/nuxt-ui.md`), shadcn/ui (`docs/ui-kit.md`), Tauri and Electron (desktop integration, updates: `system-integration.md`), three.js (`three-on-zinc.md`), Flutter, GPUI/Zed and Raylib (renderer: `ui-rendering-architecture.md`, `gpu-renderer-design.md`), Qt (`qt-comparison.md`), PocketJS (performance reference), Bun and Deno (`compat.md`), LÖVE (fused apps: `docs/zapp.md`), Arduino (boards).
- Vendored libraries: `next/third_party/README.md` (mimalloc, QuickJS-ng, yyjson, libuv, llhttp, mbedTLS, SDL3, glslang, HarfBuzz, SheenBidi, libunibreak, stb, libwebp, Yoga, meshoptimizer, cgltf, Monocypher, three.js...). Never write a regex engine, TLS, font rasterizer, SQL engine, codec or JSON parser: vendor a proven library with its licence and pinned version.

## The development machine

An Intel Mac (x86_64, 6 cores, 12 threads, 32 GB): builds through `next/tools/build`; ccache is `~/.local/bin/ccache` (the official release binary: the Homebrew formula builds its dependencies from source for over 30 minutes); a fresh worktree builds `zinc` in about 130 s with the cache warm (98% of the compiles reused; the rest is cmake's configure and the links) against 360 to 470 s cold, measured 2026-10-10 beside the loop; under several builds the CPU is held at 33 to 60% of its speed by heat (`pmset -g therm`), fans at full (Macs Fan Control); Homebrew builds every formula from source (no Intel bottles); Node 24, pnpm and `backlog` live in `~/.local`; `timeout` is a link to gtimeout; `ZINC_QEMU` is set in `~/.zshrc`. Known machine-specific test failures are listed in `next/RESUME.md`.
