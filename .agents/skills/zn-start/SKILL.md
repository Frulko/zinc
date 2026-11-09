---
name: zn-start
description: Start or resume a Zinc backlog session, one batch of tasks each worked start to end (or one given task id). Use when asked to work the backlog, take the next task, or work ZN-n; also what a worker agent in a worktree follows for its task.
---

# Work a batch of the backlog

First: if `.paused` exists at the repository root, do nothing and answer `STOP: paused` (zn-resume lifts it).

One invocation is one batch: the next task and up to four more of the same module or parent, each worked start to end (AGENTS.md, "Keep the backlog shrinking and the sessions cheap"). A task id given as argument is the whole batch. Never wait for a person (`RULES.md`).

1. Once per session: read `RESUME.md`, `RULES.md`, `TESTING.md` and `ARCHITECTURE.md` (binding rules). When they are already in your context, do not read them again. Nothing else yet.
2. Pick the batch: the given id alone, else the first task of `tools/next-task --list 10` and up to four of the following ones that share its parent or its module (none In Progress, claimed or waiting). Only `STOP nothing left` ends the session. Read each task when its turn comes with `backlog task <id> --plain` and the documents it references.
3. Run `tools/status`. Changes in the tree that you did not make are someone else's: leave them alone and commit with explicit paths.
4. Set the task In Progress (`backlog task edit <id> -s "In Progress"`). Search the web first (AGENTS.md "Search the web before each task"): a short sub-agent on a cheaper model brings ideas, solutions, optimisations and libraries with links; keep the useful ones in the task notes. State in 3 lines the task, its acceptance criteria and your plan, then work without waiting for approval.
5. When every acceptance criterion of a task passes on the feature's short run, close that task (steps 0 to 3 of zn-end: test, criteria, notes, commit) and take the next one of the batch from step 4. After the last task run zn-end yourself, then stop.

Rules (the full text is `RULES.md`):
- The goal: every demo runs unchanged on the interpreter, AOT and QuickJS; the engine stays agnostic, pluggable, readable and fast.
- Hardware: the Raspberry Pi 3B+ (`spark@192.168.2.31`, or `zinc device` to `zinc-player`) and the Mojave Intel Mac (`mowmow@192.168.2.215`) prove cross changes with a short run (AGENTS.md "The test machines"). No decision left to a person: research, score, record, go on.
- Proven vendored libraries first (licence, pinned version, `third_party/README.md`); never reinvent regex, TLS, fonts, SQL, codecs, JSON.
- The backlog is frozen: no new task. An idea or a check for later is one line in `backlog/later.md`. Too big for one session: split with `backlog task create --parent` (`New-task: split ZN-n` in the commit); blocked for real: label `parked`, say why, take the next task.
- Tests (AGENTS.md "Move fast"): the proof is the feature working (build one target, `zinc check`, one short run, headless) plus at most a seconds-long T0 `--only`. No T1, T2, `tests/demo`, `--changed`, pixel compares, benchmarks or fuzz: list them under "Tests to run" in `RESUME.md`. One T0 per new module, a regression test per bug. Demos and apps: **Proposed tests** in the notes. Warning-free builds.
- Design (AGENTS.md "Design"): new screens follow `docs/design.md` and the kit's Quiet theme.
- Machine (AGENTS.md "Spare the machine"): two trees building at most, one heavy process at a time, `timeout` on every run, kill what you started, never take the focus (`ZINC_BACKGROUND=1`).
- Commits: English, conventional (`type(scope): description`), no co-author, explicit paths, never `git add .`, never other people's uncommitted changes.

In a worker worktree (AGENTS.md "Several tasks at once", zn-coordinate): the coordinator gave you the task ids; work them in order and follow zn-end's worktree rule.
