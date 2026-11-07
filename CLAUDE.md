@AGENTS.md

## Claude Code

- `/loop /zn-start` runs the backlog on its own: one batch per iteration (up to five tasks of one module), `/zn-end` closes it and names the next one. `/zn-start <id>` works one given task. Both are in `.claude/commands/`.
- Use sub-agents for research and independent investigations (several at once when the questions are independent) and keep their findings in `docs/reports/`; read a delegated result instead of redoing the search.
- Several tasks in parallel ("Several tasks at once" above): you are the coordinator. Start the agents in one message with the Agent tool, `isolation: "worktree"`, in the background, each briefed with its task id, `.claude/commands/zn-start.md` to follow and the worktree rules (files to leave alone, no task creation, no `RESUME.md`). Integrate each branch when its agent reports; never work a task an agent holds. A new agent per batch: `SendMessage` to an agent that has reported only for a short answer, since a resumed agent pays for its whole context at every call ("Fresh contexts" above).
- Mechanical work (regenerating goldens, repairing a test script, documents, reading for research) goes to an agent with `model: "sonnet"`; engine and design work keep the default model.
- Tests at big milestones, chosen by the owner (AGENTS.md "Move fast"): during a task, prove the feature with one short run and at most a seconds-long T0 `--only`; never start T1, T2, `tests/demo`, pixel compares, benchmarks, conformance or fuzz on your own. List them under "Tests to run" in `RESUME.md` and keep going on the backlog.
- Demos and apps: no new test written or run; end the task notes and the report with **Proposed tests** (test, what it proves, duration, memory) for the owner to pick.
- Spare the machine (16 GB, AGENTS.md "Spare the machine"): two trees building at most, one heavy process (app, demo, windowed test) at a time, headless when possible, kill what you started. Worktree agents that build count.
- Never stop to ask the owner a question during the loop (see "Decide alone" above): research, decide, record, continue.
- Engine gaps are fixed, not worked around ("Fill the engine's gaps" in AGENTS.md): when code hits a missing feature or a defect of the engine, fix the engine with a test, or make it the next task; never bend the user's code around it.
- Never take the focus: every app or window you start while the owner works runs with `ZINC_BACKGROUND=1` (or `zinc --background ...`), and nothing you start is left running ("Never take the focus" in AGENTS.md).
- Changelog: a change a user can see adds one plain line under the right theme heading of `## [Unreleased]` in `CHANGELOG.md` in the same commit; written as readable Markdown for people, cut by theme (`###`), and inside a theme by kind headings (`#### New`, `#### Changed`, `#### Faster`, `#### Fixed`) over plain bullets ("The changelog" in AGENTS.md); `make release` publishes it.
- Features: go straight to the goal, make it work and look at its effect; read the callers and keep the three engines in step so the milestone run finds nothing broken (AGENTS.md "Move fast").
