---
description: Start or resume a Zinc Next session (one batch of tasks, each start to end)
argument-hint: [task number, optional]
---

First: if `.paused` exists, do nothing, stop the loop (`ScheduleWakeup` with `stop: true`) and answer `STOP: paused` (`/zn-resume` lifts it).

Resume Zinc Next work. One invocation = one batch: the next task and up to four more of the same module or parent, each worked start to end
(AGENTS.md, "Keep the backlog shrinking and the sessions cheap"). Never wait for a person (see `RULES.md`).

1. Once per session: read `RESUME.md`, `RULES.md`, `TESTING.md` and `ARCHITECTURE.md` (binding rules). When they are already in your
   context, do not read them again. Nothing else yet.
2. Pick the batch: `$ARGUMENTS` alone if given, else the first task of `tools/next-task --list 10` and up to four of the following ones that share
   its parent or its module (none In Progress, claimed or waiting). Only `STOP nothing left` ends the session. Read each task when its turn comes with
   `backlog task <id> --plain` and the documents it references (`docs/reports/parity/*`, the design, the prototype's code).
3. Run `tools/status`. Changes in the tree that you did not make are someone else's: leave them alone and commit with explicit paths.
4. Set the task In Progress (`backlog task edit <id> -s "In Progress"`), state in 3 lines the task, its acceptance criteria and your plan, then work without
   waiting for approval.
5. When every acceptance criterion of a task passes on real test output, close that task (steps 0 to 3 of `/zn-end`: test, criteria, notes, commit) and
   take the next one of the batch from step 4. After the last task run `/zn-end` yourself, then stop.

Rules (the full text is `RULES.md`):
- The goal: every demo of the prototype runs unchanged; the engine stays agnostic, pluggable, readable and fast. Match the prototype's observable behaviour.
- No hardware: use the simulators/emulators. No Windows yet (a target after the Mac, it opens the cross-platform pass). No decision left to a person: research, score, record in `docs/reports/zinc-next-decisions.md`, go on.
- Proven vendored libraries first (licence, pinned version, `third_party/README.md`); never reinvent regex, TLS, fonts, SQL, codecs, JSON.
- The backlog is frozen: no new task. An idea, an improvement or a check for later is one line in `backlog/later.md`. Too big for one session: split
  with `backlog task create --parent` (the task's own criteria, nothing more; `New-task: split ZN-n` in the commit); stuck twice: write the failing case, fix the root cause; blocked for real: label `parked`, say why, take the next task.
- Tests: the new feature's test plus `tests/run --changed` (see "What to run" in `TESTING.md`). Never the 42 demos, `examples_all`, T2, benchmarks or fuzz runs at the end of a task; those are milestone jobs, in the background. A wait over a minute is a mistake: go on with the next step. The long scripted session of a feature runs on one engine, the others get a few frames and one hash; a test that lasts over a minute is shortened before it is committed. One T0 test per new module, a regression test per bug, warning-free builds.
- Commits: English, conventional (`type(scope): description`), no co-author, explicit paths, never `git add .`, never other people's uncommitted changes.
- Use sub-agents for research and for independent investigations; measure performance, do not guess it.
