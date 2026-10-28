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
Useful environment: `ZINC_HEADLESS=1`, `ZINC_DETERMINISTIC=1`, `ZINC_FRAMES=n`, `ZINC_SHOT=file.png`, `ZINC_SCALE=1..4`, `ZINC_HOME` (toolchains and caches, default `~/.zinc`), `ZN_TRAP_TRACE=1`, `ZN_DUMP_JSX=<name>`.

## Development workflow: the backlog

The work is a backlog of precise tasks managed with **Backlog.md** (`backlog` CLI, config `backlog.config.yml`, files in `backlog/`).

- Tasks: `backlog/tasks/zn-NNN - Title.md` (description, acceptance criteria, notes). Statuses: Backlog, Ready, In Progress, Review, Done. One task In Progress at a time per working tree (several only as described in "Several tasks at once").
- Milestones `backlog/milestones/` (m-0 to m-25, e.g. M17 UI style system, M19 packaging, M21 performance, M22 games, M23 handhelds).
- Order of work: `backlog/priority.json` and the `ordinal` of each task; `tools/next-task` prints the task to do (`--list N`, `--why`). The whole order comes from a review (`docs/reports/backlog-review-2026-10-10.md`, asked by the owner): the showcase demos first, then one list of everything that can be worked on the Mac, features and demos before hardening, then the cross-platform pass. No new task while the backlog is frozen (see "Keep the backlog shrinking" below). An epic (a task with open subtasks) is never handed out. Labels: `size-S/M/L`, topics (`perf`, `ui`...), `parked` (needs a board, Windows or a paid account; ordinal 90000+, skipped), `needs-board`.
- `tools/status`: next tasks, progress per milestone, uncommitted work. `tools/tasks-import file.json`: bulk task creation with dependencies by key (`backlog/keys.json`).
- Commands: `backlog task <id> --plain`, `backlog task edit <id> -s "In Progress"`, `--check-ac <n>`, `--notes`/`--append-notes`, `backlog task create "title" -p <parent> --ac ... -m <milestone> -l <labels>`.
- A session: `/loop /zn-start` takes the next batch (the next task and up to four more of the same module), works each task start to end with its own commit (criteria ticked on real test output, Done or left open with a handover note), then `/zn-end` closes the batch once (`RESUME.md`, usage, next task). `.paused` stops the loop.
- Commits: English, conventional (`type(scope): imperative description`, 72 chars max), no co-author, explicit paths (never `git add .`), the task file in the same commit as its code. Never commit someone else's uncommitted changes. Pushing is the owner's step. The `commit-msg` hook in `.githooks/` refuses a message that breaks these rules (type, 72 chars, English, final period, co-author): fix the message, never pass `--no-verify`. Enable it once per clone: `git config core.hooksPath .githooks` (worktrees share the setting).

## Several tasks at once: one worktree per agent

Independent tasks can be worked in parallel: a coordinator session hands them out, and each agent works one task in its own git worktree and branch, so no two agents share a working tree, a build directory or an index.

- **Choose** with `tools/next-task --list 10`: tasks with no dependency between them that touch different modules (their labels, `tests/affected.json`). Two tasks in the shared core (IR, runtime, raster, layout, text, `lib/std/ui.ts`) never run together. Three trees building at most on the development Mac in all, whoever started them: the loop's own tree counts when it builds, and `git worktree list` shows the agents of the other sessions. Agents that do not build (research, documents, a fix in a test) do not count.
- **Claim**: before the agents start, the coordinator reserves every task it hands out with `tools/next-task --claim ZN-a ZN-b` (refused, with nothing changed, when a task is already worked, claimed, parked or waiting) and commits the task files on develop: `tools/next-task` skips a task that has an assignee, so the loop on develop never takes it. `next-task --release ZN-a` gives a task back.
- **Chains**: small tasks of one module go to one agent, in order, one commit per task: one worktree, one warm build, no conflict between them.
- **The base**: a new worktree may start from `origin/main`, which is only the last release. The agent's first command is `git reset --hard develop` (the local develop), before it reads or builds anything.
- **The agent** works its task as `/zn-start <id>` says, in its worktree, and commits code, test and task file on its branch. It leaves alone the files every task writes: `RESUME.md`, `backlog/priority.json`, `backlog/keys.json`, `docs/reports/zinc-next-decisions.md`, `docs/reports/zinc-next-perf.md`. It creates no task and no decision number (ids are allocated per tree and would collide): the lines for `backlog/later.md`, decisions and measured numbers go in the task notes and in its final report.
- **The coordinator** integrates one branch at a time on develop (`git cherry-pick develop..<branch>`, linear history), builds once, runs the tests of the integrated tasks, then writes what the agents left: decision records, the performance log, the lines of `backlog/later.md`, `RESUME.md`. Then `git worktree remove <path>` and `git branch -D <branch>`.
- **A conflict** at integration is resolved by the coordinator when it is a few lines; otherwise the task goes back to an agent in a fresh worktree of the updated develop.
- **Builds** go through `tools/build [target...]` in every tree, never a bare `cmake --build -jN`: one job per physical core, and make starts no new job while the load average is above the core count (above the core count the total work done drops), so trees that build at once share the cores instead of piling up, and a new build directory is configured with ccache (paths relative to the repository), so a fresh worktree reuses what another tree compiled. A task that changes only a test, a tool or a document builds nothing: it runs its test against the main tree's binary (`ZINC=<main>/build/zinc`, read-only).
- **No synthetic load**: never start `yes` loops, stress runs or a second full build to "test under load" while other trees work; say what was not proven instead.
- **Tests**: an agent runs its task's own test. Tests that open a window, bind a fixed port or measure time (benchmarks, `system_instance`, the macOS window tests) run only after integration, alone: a number measured while other agents build is not valid.

## Decide alone: the owner is not at the keyboard (owner, 2026-10-10)

Never ask the owner to choose, confirm or approve a design or technical decision: nobody is there to answer, and a question stops the loop.

- Think it through, then look for the answer: the docs (`RULES.md`, `docs/reports/`, the decision records in `docs/reports/zinc-next-decisions.md`, the task and its linked reports), the frozen corpus and the prototype under the tag `prototype-final`, and how the reference tools the owner chose solve it (React Native and Expo, Nuxt UI, Tauri and Electron, three.js, the libraries named in `docs/reports/parity/04-library-choices.md`...).
- Pick the best option (score it as `RULES.md` §4 says when it matters), write the choice and why in the task notes or a decision record, and go on. A reversible choice is made at once.
- Only an irreversible or outward-facing step (publishing, pushing, deleting data, spending money, sending a message) waits for the owner: do everything up to it and leave the exact command in the task notes.

## Focus on the development platform; cross-platform comes last (owner, 2026-10-10)

For now the engine is built and tested on the development Mac only. Do as many backlog tasks as possible there.

- No builds or tests for ARM, Raspberry Pi, ESP32, Linux, the handhelds or the CHIP during a task (no `--target` cross builds, no QEMU, no `cross*` tests). Keep the code portable, but do not prove it on those targets now.
- A task that touches a cross target: implement it, write its test, and write the cross-target verification as one line under "Cross-platform pass" in `backlog/later.md` (no new task while the backlog is frozen).
- The cross-platform pass (the deferred group, the handheld and board milestones, their tests) is done at the end, as one phase.
- Windows is a target (owner, 2026-10-11): it opens that pass, before the handhelds and the boards. Mobile (iOS, Android) stays at its end.

## Move fast: finish tasks, prove only what changed (owner, 2026-10-10)

The goal of a session is progress on the backlog: finish tasks, improve and complete the engine. Tests exist to prove a change, not to fill the session.

- Before running a test, ask what it proves. If your change cannot make it fail, do not run it.
- End of a task: the task's own test (`tests/run --only <name>`) and the few tests that cover the files you touched. Run `tests/run --changed` only when it maps to a handful of tests; when it falls back to the whole tier, pick the relevant tests yourself.
- End-to-end runs (full T1, T2, the demos, `examples_all`, the WebGL conformance, benchmarks, fuzz) belong to large milestones or to changes in the shared core (IR, runtime, raster, layout, text). Start them in the background and keep working; never wait for them.
- A command that runs for more than a minute is a background job. Do not re-run a suite that already passed for code you did not touch, and do not re-verify what you already checked in the session.
- Known failures recorded in `RESUME.md` and the backlog (machine, GPU or architecture specific) are not investigated again during an unrelated task.
- Build only the target you need (`tools/build zinc`), never the whole tree for a change in one library.
- Be critical and pragmatic: one targeted check that can fail beats a sweep of 300 tests that cannot.

## Keep the backlog shrinking and the sessions cheap (owner, 2026-10-11)

Between 2026-10-10 08:00 and 2026-10-11 09:00 the sessions closed 129 tasks and created 178: the open count rose from 353 to 402. And 96% of the week's quota went to requests made with more than 150k tokens of context. Speed per task was not the limit; these two were. The owner froze the backlog until further notice.

- **No new task.** Three exceptions, named by a trailer in the commit that adds the task file (the `commit-msg` hook refuses the commit without it): `New-task: owner <the request>` (the owner asked for it), `New-task: blocks <demo or test>` (a defect that stops a demo or a test of develop from running; it goes right after the task that found it), `New-task: split ZN-n` (a task too big for one session, cut into subtasks that hold its own criteria and nothing more).
- **Everything else is one line in `backlog/later.md`**: an idea, an improvement, hardening, a measure to take, a check on another target. `- ZN-n: what, and why it matters`, under its heading. The next backlog review (the owner asks for it) turns lines into tasks or deletes them. In a parallel worktree the lines go in the final report and the coordinator adds them.
- **A task is finished, not cut.** A criterion that does not pass yet stays in its task: the task goes back to Backlog with a handover note (what is done, what fails, the next command) and keeps its place; Review when the rest needs a person, a board or another machine. No follow-up task to be able to write Done.
- **Batches.** A session takes the next task and up to four more of the same module or parent among the ten that follow (`tools/next-task --list 10`), works them in order with one commit each, and closes once: one `RESUME.md`, one usage line, one `next-task`. The binding documents are read once per session, not once per task.
- **One long proof, short smoke checks.** The scripted session of a feature (inputs, frames, goldens) runs on one engine; the other engines run the same program for a few frames and one hash. The comparison of the three engines over the corpus is `tools/diff-matrix` at a milestone. One golden per feature, not per step. A T1 test that lasts more than a minute on a quiet machine is shortened before it is committed.
- **Fresh contexts.** A session can be restarted at any time from `RESUME.md` and the task notes: start a new one each morning and after a compaction instead of keeping one for days. The coordinator gives each batch to a new agent and resumes a finished agent only for a short answer; a brief names the task ids and the files to read, it does not retype them.

## Real JSX and TSX: `className` and capitalised components, always (owner, 2026-10-16)

Zinc supports JSX/TSX as the language defines it, so two spellings are banned everywhere (engine, standard library, kits, plugins, templates, examples, tests, documents, generated code):

- **`className`, never `class`.** `class` is a keyword of JavaScript and TypeScript; a JSX attribute or a component prop named `class` is a defect. Write `<View className="p-4">`; a component that takes the classes declares the prop `className`.
- **Components start with a capital letter, as in React and React Native**: `<View>`, `<Text>`, `<Button>`, `<ScrollView>`, `<Image>`, `<TextInput>`. A lowercase tag (`<view>`, `<text>`, `<button>`...) is not a component of Zinc: the engine refuses it with an error that names the capitalised component.

The engine enforces both (a diagnostic with the fix, `zinc explain` entry, a test); never add a back door that accepts the old spelling, and never write the old spelling in a new file, a doc or an example. Existing uses are migrated, not tolerated.

## Demos: the bar of `examples/GUIDELINES.md` (owner, 2026-10-19)

A new demo, or a change to one, follows `examples/GUIDELINES.md` (layout of `src/`, performance rules, input, proof); `/zn-demo` runs it.
On old devices (HP TouchPad, Nexus 7) the UI is the AS3-style display tree on `zinc:gfx` of `examples/music-tree`, not `zinc:ui`: it is
faster there and keeps the code organised.

## Fill the engine's gaps; never work around them (owner, 2026-10-28)

When a program, a plugin, a stand-in, a demo or a test hits something the engine lacks or gets wrong (TypeScript it refuses, a wrong result, a crash, a missing API), the engine is fixed: never rewrite the user's code to get past it, never keep a workaround.

- Reproduce it in the smallest program, fix it in the engine with a test, on every engine (interpreter, AOT, QuickJS), then write the original code as a person would.
- A fix too big for the current task is a task of its own right after it (`New-task: blocks <what it stops>`), worked next; the code that hit it waits for it rather than carrying a workaround.
- A limit that is a decision (a strict profile, a recorded `D` number) is not a gap: its diagnostic says what to write instead.

## Never take the focus: run windows in the background (owner, 2026-10-16)

A program the engine starts while someone is working (a test, a demo, a capture, an app run by an agent or a loop, `zinc dev`) must not come to the front of the computer. Set `ZINC_BACKGROUND=1` or pass `--background` (`zinc --background run <dir>`): the window opens without being activated (SDL's `WINDOW_ACTIVATE_WHEN_SHOWN`/`WHEN_RAISED` off, no Dock icon, no raise), and the frontmost application stays the one the person uses. `tests/run` sets it for every test (`ZINC_BACKGROUND=0` to watch one). Every command an agent starts by hand that can open a window (`zinc run`, `zinc dev`, a built app, `zinc device`, the window tests of `tools/`) carries it too. A headless run (`ZINC_HEADLESS=1`) opens no window and needs nothing. Leave no process behind: kill what a command started (apps, servers, QEMU) before it ends.

## Branches: develop for the work, main for the releases (owner, 2026-10-19)

Every commit goes on `develop` (or a branch merged into it); nobody commits on `main`. Pushing `develop` runs no CI and no test on GitHub: the CI runs only on a release.

- `make release` runs from `develop`: it writes the changelog section, fast-forwards `main` to `develop`, pushes both and the `v*` tag; the tag's workflow is the CI (the whole tier T2, the packages) and publishes the GitHub release only when no test failed (`make release` waits for it and says which). `main` is always the last release.
- A test failure found at a release is fixed on `develop`, then released again. A run of the whole CI without releasing: `gh workflow run zinc-next --ref develop`.

## The changelog: `CHANGELOG.md` is kept as the work goes (owner, 2026-10-16)

A release has real notes, written for the people who use Zinc, not a list of commit subjects. `CHANGELOG.md` (Keep a Changelog: *Added*, *Changed*, *Deprecated*, *Removed*, *Fixed*, *Security*) has an `## [Unreleased]` section that every change visible to a user, a plugin author or a maintainer of an app adds a line to, **in the same commit as the change** (as the task file is):

- Write what changes for them, in plain words and one or two lines: the command, the option, the error code, what they do now. Not the file, not the task number, not how it is built.
- A breaking change goes under *Changed (breaking)* with the way out (the `zinc migrate` codemod, the new spelling).
- No line for what nobody sees: tests, CI, backlog files, refactors, documents. A fix is a line only if someone could have met the bug.
- `make release` turns *Unreleased* into the new version and the GitHub release notes: it shows the draft, lets you edit it, and when *Unreleased* is empty it drafts from the commits (feat, fix, perf) as a starting point. Read it before saying yes.

## Tests

- `tests/<tier>/<name>.sh`, given `$ZINC`: T0 (seconds, the stage touched), T1 (end of a task, the feature's demo), T2 (milestone: whole corpus, interpreter vs AOT vs frozen output, benchmarks), and `tests/demo` (what a demo app itself does, beyond its one T1 session: by hand and `--changed`, never on CI). Runner: `tests/run [--tier t0|t1|t2|demo] [--only name] [--changed | --changed-from ref]`, one line per test, details in `.logs/`.
- `tests/affected.json`: which tests cover which paths (add a mapping with a new module or test). Goldens: `tests/golden/` (outputs, checker cases, frozen pixel frames of the prototype in `examples/proto` with `manifest.json`).
- A new module ships a T0 test; a behaviour change a golden or an expectation test; a bug fix a regression test.

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

An Apple M1 Pro Mac (arm64, 10 cores: 8 performance and 2 efficiency, 16 GB, macOS 15; until 2026-10 it was an Intel i7-9750H, and the build times and heat figures of older reports were measured there): builds through `tools/build`; ccache is `~/.local/bin/ccache`; Homebrew lives in `/opt/homebrew`; Node 24, pnpm and `backlog` live in `~/.local`; `timeout` is a link to gtimeout; `ZINC_QEMU` is set in `~/.zshrc`. 16 GB is the limit when several trees build: keep to the three building trees of "Several tasks at once". Known machine-specific test failures are listed in `RESUME.md`.
