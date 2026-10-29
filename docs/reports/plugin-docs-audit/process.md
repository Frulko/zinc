# zinc:process audit (score 3/5)

## What it is
Run other programs: spawn with args, cwd and env, stream stdout/stderr by line, write stdin, kill, read the exit code, or `run()` and collect everything.

## Targets and status
- plugin.json: macos, linux, windows, rpi1. Native: posix_spawn (`process.host.cpp`, `process.rpi1.cpp`); `process.sim.ts` stand-in.
- Tests: no test named after it; coverage via `tests/golden/host/process_stdin.ts` (test `host`) and users (agents, web_relay). No dedicated t0 for exit codes, kill, env, cwd.
- Windows: listed in plugin.json, but the doc says POSIX only; status unclear. QuickJS: events never fire (backlog/later.md ZN-450).

## What the docs have
- [x] overview, [x] quick start (run, spawn), [x] API table complete vs exports (spawn, run, SpawnOptions, Process members, Result)
- [x] notes (no shell, env, cwd, limits, SIGPIPE), [x] security section, [x] "how it works"
- [x] examples exist: `examples/process/shell` and `examples/process/cli`; real users `examples/agents`, `museum-table/src/update.ts`
- [ ] README in examples/process/*, [ ] screenshot of the shell runner, [ ] tutorial, [ ] dedicated test

## What is missing
1. Screenshot of the UI runner: `ZINC_SHOT=docs/img/process-shell.png zinc run examples/process/shell`.
2. READMEs for `examples/process/shell` and `cli` (none today) with the run command.
3. Tutorial "A build button": run a command, stream lines into a list, Kill, show the exit code (5 steps, on examples/process/shell).
4. A dedicated test `tests/t0/process.sh` (exit code, 128+signal, env, cwd, stdin) so the table is proven.
5. Status lines for Windows and QuickJS (ZN-450: events do not fire with `--engine quickjs`).
6. Note on macOS sandbox / hardened-runtime apps and the `zinc.json` permission, if one applies to exported apps (check docs/guide/08-security.md).

## Wrong or stale
- The long-running example runs `node compiler/bin/zinc.mjs build examples/breakout`: the Node prototype (`compiler/`) was removed on 2026-10-20. Use `zinc build examples/breakout`.
- "Targets: ... (and sim, through Node's `child_process`)": the Node `sim/` was removed; the stand-in is now `native/process.sim.ts`, check what it does before keeping the sentence.

## Suggested pages
Overview; API reference (generated); Run vs spawn; Streaming output; Security (no shell, argv, environment); Tutorial: a build runner UI; Limits and platform notes; Examples: shell, cli.
