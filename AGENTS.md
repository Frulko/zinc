# Working on Zinc

Zinc is a strict, typed subset of TypeScript for apps, games, services and boards: one program runs on a desktop, a Raspberry Pi, an ESP32, a console or the web.
The repository is the engine, Zinc Next (C++20: frontend, typed SSA IR, ZBC bytecode, interpreter, AOT to C++, QuickJS engine, graphics host, toolchain manager), with its standard library, plugins, examples and docs. Every demo of `examples/` runs on it (interpreter, AOT, `--engine quickjs`) with the plugins working, while the engine stays agnostic, pluggable, readable and fast.

The first generation, a Node prototype (`compiler/`, `sim/`), was removed on 2026-10-20 (owner): it is under the git tag `prototype-final`. Its frozen outputs stay the reference: `corpus/` and the goldens of `tests/` (`tests/conformance`, `tests/golden/examples/proto`); they are compared, no longer regenerated.

What it is for (owner, 2026-10-11): a tool to make desktop and mobile apps the way Electron does, without shipping a browser. The accent is on the UI, on performance and on running on the widest range of hardware; 3D, sound, video and games complete it and open it to more people. The users it is made for: education, makers, artists, DIY. Decide with them in mind: the first run, clear errors, modest machines.

Binding rules: `RULES.md` (never stop, simulators for hardware, proven libraries, decisions), `ARCHITECTURE.md` (layout, dependency direction), `TESTING.md` (tiers, what to run). State of the work: `RESUME.md` (short, overwritten at the end of each session).

## Repository map

| Path | What it holds |
|---|---|
| `src/` | The engine: frontend, ir, zbc, vm, aot, rt, host, qjs, gl, text, res, tc, dev, sim (the device simulator), lsp, prof, native |
| `include/zn/` | The only place a constant or an operation is defined |
| `runtime/` | zrt, the raster, the GL replay and the HAL headers, compiled into zinc |
| `third_party/` | Vendored libraries (`third_party/README.md`) |
| `tools/`, `tests/`, `backlog/` | Tools, tests (`tests/run`, tiers t0/t1/t2, goldens, `tests/conformance` and `tests/bench/kernels` of the frozen corpus), the backlog |
| `corpus/`, `bench/`, `firmware/esp32`, `app/` | The frozen corpus outputs, benchmarks, the ESP32 core firmware, the apps (`app/atelier`, `app/inspector`, `app/devicesim`) |
| `lib/` | The standard library written in Zinc/TS (`lib/std`, the UI kits `lib/std/kit`, `lib/std/nuxt`, `zinc.d.ts`) |
| `plugins/` | 58 plugins (`plugin.json` + Zinc code + native code): system, video, sqlite, three, 3d, canvas2d, lottie, svg, socket, process, displays, webview... |
| `examples/` | The demos that must run unchanged (hero, breakout, nuxt-ui, rn-showcase, rn-port, three, maps, video, zed-editor...) |
| `templates/` | Project templates used by `zinc new` |
| `targets/` | The HALs per platform (`macos`, `common`, `null`, `windows`, consoles), `console/`, `web/`, `wasm/`, and `capabilities.json` (what each profile offers) |
| `boards/`, `devices/` | Board presets (ESP32 panels, Scroll pHAT), the simulated devices of `zinc run --simulate` |
| `docs/` | Guides, plugin and target docs, reports, decisions (see below) |
| `packages/`, `integrations/`, `site/`, `scripts/` | The Vite plugin, the reMarkable integration, the web site, `cdp-check.mjs` |

## Build, run, test

```sh
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release     # once
tools/build zinc                                    # after a change: only the target you need (load-aware, see below)
build/zinc run examples/hero                     # run a program or project (--interp, --engine quickjs, --profile esp32)
build/zinc doctor                                   # engine, renderer, pinned tools, host tools, plugins
tests/run --only <name>                             # one test; tests/run --changed: the tests mapped to your changes
```

Main `zinc` commands (table in `src/cli_core.cpp`): `run`, `build` (`--target` cross builds with the pinned zig), `check`, `test`, `new`/`init`, `dev` (watch + DevTools inspector), `export`, `deploy`, `pack`/`fuse` (.zapp), `publish`/`update-app`, `add`/`remove`/`install`/`plugins`/`trust` (signed plugin index), `capture`, `bench`, `toolchain`, `explain`, `lsp`, `flash`, `agent` (the daemon that makes a Linux or macOS machine a device) and `device` (its client: what adb does, over the network; `docs/reports/zinc-next-agent.md`).
Useful environment: `ZINC_HEADLESS=1`, `ZINC_DETERMINISTIC=1`, `ZINC_FRAMES=n`, `ZINC_REALTIME=1` (headless frames at 60 a second on the real clock: `ZINC_FRAMES` becomes a duration), `ZINC_DURATION=ms`, `ZINC_SHOT=file.png`, `ZINC_SCALE=1..4`, `ZINC_HOME` (toolchains and caches, default `~/.zinc`), `ZN_TRAP_TRACE=1`, `ZN_DUMP_JSX=<name>`.

## Development workflow: the backlog

The work is a backlog of precise tasks managed with **Backlog.md** (`backlog` CLI, config `backlog.config.yml`, files in `backlog/`).

- Tasks: `backlog/tasks/zn-NNN - Title.md` (description, acceptance criteria, notes). Statuses: Backlog, Ready, In Progress, Review, Done. One task In Progress at a time per working tree (several only as described in "Several tasks at once").
- Milestones `backlog/milestones/` (m-0 to m-25, e.g. M17 UI style system, M19 packaging, M21 performance, M22 games, M23 handhelds).
- Order of work: `backlog/priority.json` and the `ordinal` of each task; `tools/next-task` prints the task to do (`--list N`, `--why`). The whole order comes from a review (`docs/reports/backlog-review-2026-10-10.md`, asked by the owner): the showcase demos first, then one list of everything that can be worked on the Mac, features and demos before hardening, then the cross-platform pass. No new task while the backlog is frozen (see "Keep the backlog shrinking" below). An epic (a task with open subtasks) is never handed out. Labels: `size-S/M/L`, topics (`perf`, `ui`...), `parked` (needs a board, Windows or a paid account; ordinal 90000+, skipped), `needs-board`.
- `tools/status`: next tasks, progress per milestone, uncommitted work. `tools/tasks-import file.json`: bulk task creation with dependencies by key (`backlog/keys.json`).
- Commands: `backlog task <id> --plain`, `backlog task edit <id> -s "In Progress"`, `--check-ac <n>`, `--notes`/`--append-notes`, `backlog task create "title" -p <parent> --ac ... -m <milestone> -l <labels>`.
- The loop's procedures are skills shared by Claude Code and Codex in `.agents/skills/`: `zn-start` (a batch), `zn-end` (close it), `zn-coordinate` (several workers in worktrees, integration with `tools/integrate`), `zn-pause`, `zn-resume`. Claude Code runs them through `/zn-start`, `/zn-end` and `/loop`; Codex through `tools/codex-loop` (lanes of claim, worker, integrate, one fresh `codex exec` each). One coordinator at a time, whichever agent.
- A session: `/loop /zn-start` takes the next batch (the next task and up to four more of the same module), works each task start to end with its own commit (criteria ticked on the feature's short run, Done or left open with a handover note), then `/zn-end` closes the batch once (`RESUME.md`, usage, next task). `.paused` stops the loop.
- Commits: English, conventional (`type(scope): imperative description`, 72 chars max), no co-author, explicit paths (never `git add .`), the task file in the same commit as its code. Never commit someone else's uncommitted changes. Pushing is the owner's step. The `commit-msg` hook in `.githooks/` refuses a message that breaks these rules (type, 72 chars, English, final period, co-author): fix the message, never pass `--no-verify`. Enable it once per clone: `git config core.hooksPath .githooks` (worktrees share the setting).

## Several tasks at once: one worktree per agent

Independent tasks can be worked in parallel: a coordinator session hands them out, and each agent works one task in its own git worktree and branch, so no two agents share a working tree, a build directory or an index.

- **Choose** with `tools/next-task --list 10`: tasks with no dependency between them that touch different modules (their labels, `tests/affected.json`). Two tasks in the shared core (IR, runtime, raster, layout, text, `lib/std/ui.ts`) never run together. Two trees building at most on the development Mac in all, whoever started them ("Spare the machine"): the loop's own tree counts when it builds, and `git worktree list` shows the agents of the other sessions. Agents that do not build (research, documents, a fix in a test) do not count.
- **Claim**: before the agents start, the coordinator reserves every task it hands out with `tools/next-task --claim ZN-a ZN-b` (refused, with nothing changed, when a task is already worked, claimed, parked or waiting) and commits the task files on develop: `tools/next-task` skips a task that has an assignee, so the loop on develop never takes it. `next-task --release ZN-a` gives a task back.
- **Chains**: small tasks of one module go to one agent, in order, one commit per task: one worktree, one warm build, no conflict between them.
- **The base**: a new worktree may start from `origin/main`, which is only the last release. The agent's first command is `git reset --hard develop` (the local develop), before it reads or builds anything.
- **The agent** works its task as `/zn-start <id>` says, in its worktree, and commits code, test and task file on its branch. It leaves alone the files every task writes: `RESUME.md`, `backlog/priority.json`, `backlog/keys.json`, `docs/reports/zinc-next-decisions.md`, `docs/reports/zinc-next-perf.md`. It creates no task and no decision number (ids are allocated per tree and would collide): the lines for `backlog/later.md`, decisions and measured numbers go in the task notes and in its final report.
- **The coordinator** integrates one branch at a time on develop (`tools/integrate <branch>`: `git cherry-pick develop..<branch>`, linear history, other sessions' uncommitted work kept), builds once, runs each integrated feature once (a short run, as for a task), adds the agents' proposed tests to "Tests to run" in `RESUME.md`, then writes what the agents left: decision records, the performance log, the lines of `backlog/later.md`, `RESUME.md`. Then `git worktree remove <path>` and `git branch -D <branch>`.
- **A conflict** at integration is resolved by the coordinator when it is a few lines; otherwise the task goes back to an agent in a fresh worktree of the updated develop.
- **Builds** go through `tools/build [target...]` in every tree, never a bare `cmake --build -jN`: one job per physical core, and make starts no new job while the load average is above the core count (above the core count the total work done drops), so trees that build at once share the cores instead of piling up, and a new build directory is configured with ccache (paths relative to the repository), so a fresh worktree reuses what another tree compiled. A task that changes only a test, a tool or a document builds nothing: it runs its test against the main tree's binary (`ZINC=<main>/build/zinc`, read-only).
- **No synthetic load**: never start `yes` loops, stress runs or a second full build to "test under load" while other trees work; say what was not proven instead.
- **Tests**: an agent runs no suite (see "Move fast"): it proves its feature with a short run and lists its proposed tests in its report. Tests that open a window, bind a fixed port or measure time (benchmarks, `system_instance`, the macOS window tests) run only at a milestone the owner chose, alone: a number measured while other agents build is not valid.

## Search the web before each task (owner, 2026-11-07)

Every backlog task starts with a short web search: how other engines, runtimes and libraries solve it (V8, JavaScriptCore, QuickJS, Hermes, Bun, Deno, React Native, Flutter, Skia, Godot, the references named below), the papers and posts on it, a proven library that already does it, the known optimisations and pitfalls. Ten minutes, not a survey: a sub-agent (`model: "sonnet"`) brings back ideas, leads, solutions, optimisations and libraries worth a look, with links; the useful ones go in the task notes (a longer finding in `docs/reports/`). Then decide and build. A library found this way is vendored only as "Proven libraries" says (licence, pinned version).

## Decide alone: the owner is not at the keyboard (owner, 2026-10-10)

Never ask the owner to choose, confirm or approve a design or technical decision: nobody is there to answer, and a question stops the loop.

- Think it through, then look for the answer: the docs (`RULES.md`, `docs/reports/`, the decision records in `docs/reports/zinc-next-decisions.md`, the task and its linked reports), the frozen corpus and the prototype under the tag `prototype-final`, and how the reference tools the owner chose solve it (React Native and Expo, Nuxt UI, Tauri and Electron, three.js, the libraries named in `docs/reports/parity/04-library-choices.md`...).
- Pick the best option (score it as `RULES.md` §4 says when it matters), write the choice and why in the task notes or a decision record, and go on. A reversible choice is made at once.
- Only an irreversible or outward-facing step (publishing, pushing, deleting data, spending money, sending a message) waits for the owner: do everything up to it and leave the exact command in the task notes.

## Development platform first; the cross-platform work advances on three test machines (owner, 2026-10-10, revised 2026-11-10)

The engine is built on the development Mac. Cross-platform work advances too, cross builds included, proven on the test machines below: a Raspberry Pi 3B+ with the player, an Intel Mac on Mojave, and an Intel Linux OptiPlex added by the owner on 2026-11-10.

- Cross builds (`zinc build --target`, `zinc export --target rpi`, the pinned zig) run on the development Mac, one at a time: a cross build counts as a building tree ("Spare the machine").
- Prove a cross change with a short run on the test machine (deploy, a few frames or one command, `timeout` on it), as for any task; long runs and measurements there are listed under "Tests to run" in `RESUME.md`.
- No QEMU and no emulators when the real machine is there. Targets without a machine (ESP32, the handhelds, the CHIP, Windows, mobile) stay as before: implement, write the test, and one line under "Cross-platform pass" in `backlog/later.md`.
- Windows opens the rest of the pass when a machine is there; mobile (iOS, Android) stays at its end.

## Move fast: tests at big milestones, chosen by the owner (owner, 2026-10-10, revised 2026-11-07)

The goal of a session is progress on the backlog: finish tasks, improve and complete the engine. Test runs are long, burn the machine's energy and memory, and stop the backlog: they run at big milestones, and the owner chooses which.

**Feature first (owner, 2026-10-31).** Go straight to the goal: make it work in the real app, look at what it changes. Iterate in small steps, quick wins first.

- **The proof of a task is the feature working**, not a suite: build the one target (`tools/build zinc`), `zinc check` what you touched, and one short run of the program the change affects (headless when it can be, few frames, a `ZINC_SHOT` to look at). The criteria are ticked on that.
- **Only the cheap, exact check runs during the work**: a T0 test of the stage touched, seconds long, that your change can make fail (`tests/run --only <name>`). Nothing else: no T1, no `tests/demo`, no T2, no `tests/run --changed` that falls back to a tier, no `examples_all`, no pixel compare, no benchmark, conformance or fuzz run.
- **Write the test, don't run the suite.** A bug fix still adds its small regression test, a new module its T0 test; they are committed with the code and run at the next milestone.
- **Not broken at the milestone**, without running everything now: read the callers of what you change, keep the three engines (interpreter, AOT, QuickJS) in step, never leave a migration half done, build warning-free. Careful reading is cheaper than a suite.
- **Demos and apps stay out of the tests.** A new or changed demo or app gets no new T1 session, golden or `tests/demo` script by default. The task notes and the batch report end with **Proposed tests**: one line each (the test or command, what it proves, rough duration and memory). The owner picks; only a chosen test is written and run.
- **Big runs are the owner's call.** T1, T2, `tests/demo`, the pixel compare, benchmarks, conformance, fuzz and a CI run (`gh workflow run`) start only when the owner asks, or at a milestone the owner named. Until then they are listed under **Tests to run** in `RESUME.md` (command, why, since which commit) and the backlog goes on. Listing is not asking: the loop never stops for it (see "Decide alone").
- A milestone run that fails is fixed first, before any new task.
- Known failures recorded in `RESUME.md` and the backlog (machine, GPU or architecture specific) are not investigated again during an unrelated task.
- Build only the target you need (`tools/build zinc`), never the whole tree for a change in one library.

## Spare the machine: memory and energy (owner, 2026-11-07)

The development Mac has 16 GB, shared with the owner's own work. A session must never eat it.

**Swap is fine, a runaway is not.** The Mac may swap under a build or a large run. What must never happen again is memory used climbing to hundreds of gigabytes (246 GB seen, RAM + swap + compressed): that is a runaway process or too many heavy jobs at once, and it freezes the owner's machine.

- **Bound every run you start**: `timeout <s>` on every app, demo or test you launch by hand, so a leak or a loop cannot grow for an hour.
- **Watch what you start**: a process of yours that passes a few GB and keeps growing is a bug, not a load. Kill it, find the cause (leak, loop, unbounded cache) in the smallest program, and only then run it again.

- **Two trees building at most** on the machine, whoever started them, always through `tools/build`. Parallel agents that build count; research and document agents do not.
- **One heavy process at a time**: one app, demo or windowed test running, never two `zinc` runs side by side, never a test while a link of `zinc` runs. Prefer `ZINC_HEADLESS=1` (no window, no GPU surface).
- **Leave nothing running**: kill what you started (apps, `zinc dev`, servers, simulators) as soon as you have looked at it.
- A long command runs in the background only when the owner asked for it; a background job is still a job on the machine and counts in the limits above.

## Keep the backlog shrinking and the sessions cheap (owner, 2026-10-11)

Between 2026-10-10 08:00 and 2026-10-11 09:00 the sessions closed 129 tasks and created 178: the open count rose from 353 to 402. And 96% of the week's quota went to requests made with more than 150k tokens of context. Speed per task was not the limit; these two were. The owner froze the backlog until further notice.

- **No new task.** Three exceptions, named by a trailer in the commit that adds the task file (the `commit-msg` hook refuses the commit without it): `New-task: owner <the request>` (the owner asked for it), `New-task: blocks <demo or test>` (a defect that stops a demo or a test of develop from running; it goes right after the task that found it), `New-task: split ZN-n` (a task too big for one session, cut into subtasks that hold its own criteria and nothing more).
- **Everything else is one line in `backlog/later.md`**: an idea, an improvement, hardening, a measure to take, a check on another target. `- ZN-n: what, and why it matters`, under its heading. The next backlog review (the owner asks for it) turns lines into tasks or deletes them. In a parallel worktree the lines go in the final report and the coordinator adds them.
- **A task is finished, not cut.** A criterion that does not pass yet stays in its task: the task goes back to Backlog with a handover note (what is done, what fails, the next command) and keeps its place; Review when the rest needs a person, a board or another machine. No follow-up task to be able to write Done.
- **Batches.** A session takes the next task and up to four more of the same module or parent among the ten that follow (`tools/next-task --list 10`), works them in order with one commit each, and closes once: one `RESUME.md`, one usage line, one `next-task`. The binding documents are read once per session, not once per task.
- **One long proof, short smoke checks** (when the owner chose the test). The scripted session of a feature (inputs, frames, goldens) runs on one engine; the other engines run the same program for a few frames and one hash. The comparison of the three engines over the corpus is `tools/diff-matrix` at a milestone. One golden per feature, not per step. A T1 test that lasts more than a minute on a quiet machine is shortened before it is committed.
- **Fresh contexts.** A session can be restarted at any time from `RESUME.md` and the task notes: start a new one each morning and after a compaction instead of keeping one for days. The coordinator gives each batch to a new agent and resumes a finished agent only for a short answer; a brief names the task ids and the files to read, it does not retype them.

## Real JSX and TSX: `className` and capitalised components, always (owner, 2026-10-16)

Zinc supports JSX/TSX as the language defines it, so two spellings are banned everywhere (engine, standard library, kits, plugins, templates, examples, tests, documents, generated code):

- **`className`, never `class`.** `class` is a keyword of JavaScript and TypeScript; a JSX attribute or a component prop named `class` is a defect. Write `<View className="p-4">`; a component that takes the classes declares the prop `className`.
- **Components start with a capital letter, as in React and React Native**: `<View>`, `<Text>`, `<Button>`, `<ScrollView>`, `<Image>`, `<TextInput>`. A lowercase tag (`<view>`, `<text>`, `<button>`...) is not a component of Zinc: the engine refuses it with an error that names the capitalised component.

The engine enforces both (a diagnostic with the fix, `zinc explain` entry, a test); never add a back door that accepts the old spelling, and never write the old spelling in a new file, a doc or an example. Existing uses are migrated, not tolerated.

## Demos: the bar of `examples/GUIDELINES.md` (owner, 2026-10-19)

A new demo, or a change to one, follows `examples/GUIDELINES.md` (layout of `src/`, performance rules, input); `/zn-demo` runs it. Its tests are proposed, not written or run: the owner picks ("Move fast").
On old devices (HP TouchPad, Nexus 7) the UI is the AS3-style display tree on `zinc:gfx` of `examples/music-tree`, not `zinc:ui`: it is
faster there and keeps the code organised.

## Design: quiet, neutral, keyboard first (owner, 2026-11-09)

The look of every new demo, app and template (parent task ZN-1078, details in `docs/design.md`):
- **Neutral surfaces, one accent.** Greys for surfaces and text, one accent colour for the primary action and the selection; status colours (red, amber, green) only for status.
- **Hairline borders, shadows only on what floats.** Cards and fields get a 1 px border, not a shadow; menus, popovers, dialogs and toasts float and get the shadow.
- **Motion explains what changed.** Springs for moves and opens, no decoration loops; every animation has a reduced-motion path.
- **Every control works from the keyboard,** with a visible focus ring.
- **The Quiet theme of the kit** carries these tokens (light and dark): use it instead of hand-picked colours.
- **Lean:** a kit component costs only when a program uses it (one module per family, no import-time side effects, icons one by one); the size gate of ZN-1078 keeps it so.

## Fill the engine's gaps; never work around them (owner, 2026-10-28)

When a program, a plugin, a stand-in, a demo or a test hits something the engine lacks or gets wrong (TypeScript it refuses, a wrong result, a crash, a missing API), the engine is fixed: never rewrite the user's code to get past it, never keep a workaround.

- Reproduce it in the smallest program, fix it in the engine with a test, on every engine (interpreter, AOT, QuickJS), then write the original code as a person would.
- A fix too big for the current task is a task of its own right after it (`New-task: blocks <what it stops>`), worked next; the code that hit it waits for it rather than carrying a workaround.
- A limit that is a decision (a strict profile, a recorded `D` number) is not a gap: its diagnostic says what to write instead.

## Explicit state: no implicit state machines (owner, 2026-11-07)

The audit of 2026-11-06 (`docs/reports/implicit-state-machines.md`) found more than a hundred lifecycles held in loose flags, nullable handles and sentinels. They hang after a restart, free memory still in use, or let a stale handle drive somebody else's object. New code never adds one, and code you touch is left better than you found it.

- **One enum and one transition function per lifecycle.** An object that has phases (connecting, ready, closing, closed, failed) stores one `state` field and changes it only through one function, which rejects illegal transitions. Two or more bools that together mean a phase, or a `-1`/`0`/`""`/`null` that means a phase, are a defect.
- **Reset on restart.** Every stop, quit or failed flag is reset where the thing starts again (crash-restart, `zinc dev` reload, a long-lived LSP or agent). Never leave a flag that stays set forever.
- **Restore with RAII or `finally`, never by hand.** A saved and restored depth, current owner or `in_frame` flag uses a C++ guard object or a TS `try/finally`, so an early return, a throw or a longjmp unwinds it. Code that `crash()`/longjmps past a frame resets its state at the restart point.
- **Shared between threads: atomic or locked.** A flag read by another thread is `std::atomic` or lives under the same mutex as the data it guards. Never a plain `bool`.
- **Handles carry a generation.** A slot table (plugin handles, views, sockets, VMs, players, UI nodes) hands out `index | generation << n`, or monotonic ids. A stale handle, or a queued event or reply for a closed slot, is refused, never delivered to the new object. Closing a slot drops its queued events.
- **"Failed" is not "never tried".** A cache or registry keeps distinct states for not tried, in progress, ready and failed (with the error), so it can retry or report.
- **State in files takes a lock.** Trials, leases, pairing and caches on disk use a lock file (`flock`) and an atomic rename. Never act on pids read from a stale file without checking they are still ours.
- **Prove it.** A fix or a new lifecycle adds one T0 test that drives the bad transition (a throw inside `batch`, a second start, a stale handle after close, a restart) and checks the state afterwards.

## Never take the focus: run windows in the background (owner, 2026-10-16)

A program the engine starts while someone is working (a test, a demo, a capture, an app run by an agent or a loop, `zinc dev`) must not come to the front of the computer. Set `ZINC_BACKGROUND=1` or pass `--background` (`zinc --background run <dir>`): the window opens without being activated (SDL's `WINDOW_ACTIVATE_WHEN_SHOWN`/`WHEN_RAISED` off, no Dock icon, no raise), and the frontmost application stays the one the person uses. `tests/run` sets it for every test (`ZINC_BACKGROUND=0` to watch one). Every command an agent starts by hand that can open a window (`zinc run`, `zinc dev`, a built app, `zinc device`, the window tests of `tools/`) carries it too. A headless run (`ZINC_HEADLESS=1`) opens no window and needs nothing. Leave no process behind: kill what a command started (apps, servers, QEMU) before it ends.

## Branches: develop for the work, main for the releases (owner, 2026-10-19)

Every commit goes on `develop` (or a branch merged into it); nobody commits on `main`. Pushing `develop` runs no CI and no test on GitHub: the CI runs only on a release.

- `make release` runs from `develop`: it writes the changelog section, fast-forwards `main` to `develop`, pushes both and the `v*` tag; the tag's workflow is the CI (the whole tier T2, the packages) and publishes the GitHub release only when no test failed (`make release` waits for it and says which). `main` is always the last release.
- A test failure found at a release is fixed on `develop`, then released again. A run of the whole CI without releasing: `gh workflow run zinc-next --ref develop`.

## The changelog: `CHANGELOG.md` is kept as the work goes (owner, 2026-10-16)

A release has real notes, written for the people who use Zinc, not a list of commit subjects. `CHANGELOG.md` (Keep a Changelog) has an `## [Unreleased]` section that every change visible to a user, a plugin author or a maintainer of an app adds a line to, **in the same commit as the change** (as the task file is).

How it reads (owner, 2026-10-31): well-written Markdown that a person reads with pleasure, never a wall of lines.

- **Cut by theme, then by kind.** Under a version, `###` headings name what people work with (*Raspberry Pi and the shell*, *Devices and deploy*, *Rendering and performance*, *UI*, *Plugins*, *Tools*...), most important first. Inside a theme the kind is a `####` heading, in this order and only when it has lines: `#### New`, `#### Changed`, `#### Faster`, `#### Fixed`; the bullets under it carry no bold word, and a new line goes at the end of its kind's list. *Breaking changes* get their own `###` heading at the top, with the way out (the `zinc migrate` codemod, the new spelling), with no kind headings.
- **A release opens with two or three sentences**: what this version is about, in plain words, before any list.
- **One idea per bullet, one or two lines**: what people can do now, with the command, option or `zinc.json` key in code spans. Not the file, not the task number, not how it is built; no jargon a user would not know, no internal names.
- **Group the small things**: several small fixes of one area make one bullet, not five.
- No line for what nobody sees: tests, CI, backlog files, refactors, documents. A fix is a line only if someone could have met the bug.
- While the work goes, a commit adds its line under the right heading of *Unreleased*; at a release the section is reread and rewritten whole so it reads as one text.
- `make release` turns *Unreleased* into the new version and the GitHub release notes: it shows the draft, lets you edit it, and when *Unreleased* is empty it drafts from the commits (feat, fix, perf) as a starting point. Read it before saying yes.

## Tests

- `tests/<tier>/<name>.sh`, given `$ZINC`: T0 (seconds, the stage touched), T1 (end of a task, the feature's demo), T2 (milestone: whole corpus, interpreter vs AOT vs frozen output, benchmarks), and `tests/demo` (what a demo app itself does, beyond its one T1 session: by hand and `--changed`, never on CI). Runner: `tests/run [--tier t0|t1|t2|demo] [--only name] [--changed | --changed-from ref]`, one line per test, details in `.logs/`.
- `tests/affected.json`: which tests cover which paths (add a mapping with a new module or test). Goldens: `tests/golden/` (outputs, checker cases, frozen pixel frames of the prototype in `examples/proto` with `manifest.json`).
- A new module ships a T0 test; a behaviour change a golden or an expectation test; a bug fix a regression test. They are written with the code and run at the milestones the owner chooses ("Move fast"); demos and apps get proposed tests only.

## Tools (`tools/`)

- Backlog and session: `next-task`, `status`, `tasks-import`, `usage`.
- Comparison and correctness: `diff-matrix` (interpreter vs AOT vs frozen), `oracle` (reference tsc), `test262`, `dts-walk`, `abi-check`, `example-output`, `examples-status`, `layout-fuzz`, `layout-fixtures`, `webgl-conformance`, `three-compare`, `fuzz` (libFuzzer).
- Pixels: `proto-capture` (compares with the frozen prototype frames: `compare`, `--canary`, `--all`), `pngdiff`, `pixel-compare`, `glcompare`, `style-neutrality`, `contrast-check`, `oklab-tints`, `scene-texts` (the TEXT strings of a scene dump); `cdp.py` drives headless Chrome.
- Performance: `zbench` (one entry point for rendering and boundary measurements on a Mac, an Android or webOS tablet, an iPhone or iPad, a Raspberry Pi: one corpus, one JSON format, `show` and `gate`; `docs/reports/render-bench-design.md`), `bench`, `bench-gate` (fails above 15%), `bench-m1`, `bench-m4`, `bench-layout`, `bench-render`, `bench-bridge` (the zinc:script boundary, run by `zbench --suite boundary`), `resmon` (CPU, RSS, energy), `window-memory` (the physical footprint of a windowed app on macOS, by hand, never in a tier); log every number in `docs/reports/zinc-next-perf.md`.
- Devices: `zinc agent` on the device and `zinc device` on the workstation for everything a paired device does (shell, files, apps, logs, forwarded ports); `device <user@host>` (the measuring tool, a Linux board over ssh: `status`, `sysroot` for cross-built plugins, `push`, `run`, `shot`, `profile`, `stacks`; `docs/reports/raspberry-pi.md`).
- Packaging and distribution: `package`, `sign-macos`, `appimage`, `build-wasm`, `build-esp32-core`, `index-repo` (signed TUF index), `tlog`, `plugin-split`, `gh-org-setup`.

## Documentation and references

- Decisions: `docs/reports/zinc-next-decisions.md` (D1 to D50 and on: read before deciding again), `docs/decisions/` (the prototype's ADRs). Design: `docs/reports/zinc-next-design.md`.
- Parity audit, from which the backlog comes: `docs/reports/parity/01-language-cli-std.md`, `02-examples.md`, `03-plugins-targets.md`, `04-library-choices.md` (scored library choices).
- Performance log: `docs/reports/zinc-next-perf.md`. Module reports: `docs/reports/zinc-next-*.md`. Research: `docs/reports/research-2026-09-30/`, `docs/reports/hardware/` (handhelds, CHIP, Pi, PocketJS), `docs/reports/games/`.
- User docs: `docs/guide/01..09`, `docs/ui.md`, `docs/ui-kit.md`, `docs/nuxt-ui.md`, `docs/react-native.md`, `docs/plugins/*.md`, `docs/targets/*.md`.
- Reference products the owner models Zinc on: React Native and Yoga (`docs/react-native.md`, `rn-port-spike.md`, `layout-engines.md`), Expo, Nuxt UI 4 (`docs/nuxt-ui.md`), shadcn/ui (`docs/ui-kit.md`), Tauri and Electron (desktop integration, updates: `system-integration.md`), three.js (`three-on-zinc.md`), Flutter, GPUI/Zed and Raylib (renderer: `ui-rendering-architecture.md`, `gpu-renderer-design.md`), Qt (`qt-comparison.md`), PocketJS (performance reference), Bun and Deno (`compat.md`), LÖVE (fused apps: `docs/zapp.md`), Arduino (boards).
- Vendored libraries: `third_party/README.md` (mimalloc, QuickJS-ng, yyjson, libuv, llhttp, mbedTLS, SDL3, glslang, HarfBuzz, SheenBidi, libunibreak, stb, libwebp, Yoga, meshoptimizer, cgltf, Monocypher, three.js...). Never write a regex engine, TLS, font rasterizer, SQL engine, codec or JSON parser: vendor a proven library with its licence and pinned version.

## The development machine

An Apple M1 Pro Mac (arm64, 10 cores: 8 performance and 2 efficiency, 16 GB, macOS 15; until 2026-10 it was an Intel i7-9750H, and the build times and heat figures of older reports were measured there): builds through `tools/build`; ccache is `/opt/homebrew/bin/ccache` (Homebrew, reinstalled 2026-11-08); Homebrew lives in `/opt/homebrew`; Node 24, pnpm and `backlog` live in `~/.local`; `timeout` is a link to gtimeout; `ZINC_QEMU` is set in `~/.zshrc`. 16 GB is the limit when several trees build: keep to the two building trees and the one heavy process of "Spare the machine". Known machine-specific test failures are listed in `RESUME.md`.

## The test machines (owner, 2026-11-07, updated 2026-11-10)

| Machine | Reach | What it is for |
|---|---|---|
| Raspberry Pi 3B+ (aarch64, 1 GB, Debian 13 trixie, the Zinc player image: `zinc-agent`, `zinc-shell`, `zinc-power-guard`) | `ssh spark@192.168.2.31` (hostname `zinc-player`); `zinc device` pairs with its agent | Linux ARM: cross builds and exports for `rpi`, the player and the shell, `zinc device` deploy, GPU and memory limits of a small board |
| Intel MacBook Pro (i5-4288U, 8 GB, macOS 10.14.6 Mojave, x86_64) | `ssh mowmow@192.168.2.215` | Older and Intel macOS: the x86_64 build, the oldest supported macOS, packages and `.app` bundles on it |
| OptiPlex (i3-7100T, 2 cores/4 threads, 16 GB, Fedora Linux 45 KDE, x86_64) | `ssh mowmow@192.168.2.228`; Tailscale `mowmow@100.66.7.14` / `optiplex.tail80b63.ts.net` | Linux Intel: cross-built programs, packages and desktop/backend parity. LAN and Tailscale SSH verified 2026-11-10; the same host key can be checked over Tailscale with `-o HostKeyAlias=192.168.2.228`. No compiler, build tools or Zinc executable installed when inventoried; use bounded cross-built programs in an owned directory first. |

All are shared with the owner: deploy under a directory of your own (`~/zn/<name>/`), never touch what is already in the home directories, never restart the Pi's `zinc-shell` or agent unless the task is about them, and leave no process running. The Pi has 1 GB: one Zinc program at a time on it. Every remote run is bounded with `timeout`; availability of a desktop session or GPU is verified before claiming a windowed proof.

## App and demo authoring skills

Before building or substantially refactoring a Zinc app, read [.agents/skills/zinc-app/SKILL.md](.agents/skills/zinc-app/SKILL.md). For a demo under `examples/`, also read [.agents/skills/zinc-demo/SKILL.md](.agents/skills/zinc-demo/SKILL.md). Small fixes use the relevant guidance without scaffolding or unrelated refactors. These skills require looking up existing std/plugin/app providers and checking readable ownership before adding infrastructure; they do not replace the binding rules above.

Measured reuse needs and migration boundaries: [app/demo reuse audit](docs/reports/app-demo-reuse-audit-2026-10-31.md). Proposed APIs in that report are not implemented exports.
