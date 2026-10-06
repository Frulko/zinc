---
description: Start or resume a Zinc Next session (one task, start to end)
argument-hint: [task number, optional]
---

Resume Zinc Next work. One invocation = one task, start to end. Never wait for a person (see `next/RULES.md`).

1. Read `next/RESUME.md`, `next/RULES.md`, `next/TESTING.md` and `next/ARCHITECTURE.md` (binding rules). Nothing else yet.
2. Pick the task: `$ARGUMENTS` if given, else the output of `next/tools/next-task`. Only `STOP nothing left` ends the session. Read the task with
   `backlog task <id> --plain` and the documents it references (`docs/reports/parity/*`, the design, the prototype's code).
3. Run `next/tools/status`. Changes in `next/` that you did not make are someone else's: leave them alone and commit with explicit paths.
4. Set the task In Progress (`backlog task edit <id> -s "In Progress"`), state in 3 lines the task, its acceptance criteria and your plan, then work without
   waiting for approval.
5. When every acceptance criterion passes on real test output, run `/zn-end` yourself, then stop.

Rules (the full text is `next/RULES.md`):
- The goal: every demo of the prototype runs unchanged; the engine stays agnostic, pluggable, readable and fast. Match the prototype's observable behaviour.
- No hardware: use the simulators/emulators. No Windows. No decision left to a person: research, score, record in `docs/reports/zinc-next-decisions.md`, go on.
- Proven vendored libraries first (licence, pinned version, `third_party/README.md`); never reinvent regex, TLS, fonts, SQL, codecs, JSON.
- Too big: split with `backlog task create --parent`; stuck twice: write the failing case, fix the root cause; blocked for real: label `parked`, say why, take the next task.
- Run only the smallest test tier that proves the change, quiet (`next/tests/run`). One T0 test per new module, a regression test per bug, warning-free builds.
- Commits: English, conventional (`type(scope): description`), no co-author, explicit paths, never `git add .`, never other people's uncommitted changes.
- Use sub-agents for research and for independent investigations; measure performance, do not guess it.
