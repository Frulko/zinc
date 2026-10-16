@AGENTS.md

## Claude Code

- `/loop /zn-start` runs the backlog on its own: one batch per iteration (up to five tasks of one module), `/zn-end` closes it and names the next one. `/zn-start <id>` works one given task. Both are in `.claude/commands/`.
- Use sub-agents for research and independent investigations (several at once when the questions are independent) and keep their findings in `docs/reports/`; read a delegated result instead of redoing the search.
- Several tasks in parallel ("Several tasks at once" above): you are the coordinator. Start the agents in one message with the Agent tool, `isolation: "worktree"`, in the background, each briefed with its task id, `.claude/commands/zn-start.md` to follow and the worktree rules (files to leave alone, no task creation, no `RESUME.md`). Integrate each branch when its agent reports; never work a task an agent holds. A new agent per batch: `SendMessage` to an agent that has reported only for a short answer, since a resumed agent pays for its whole context at every call ("Fresh contexts" above).
- Mechanical work (regenerating goldens, repairing a test script, documents, reading for research) goes to an agent with `model: "sonnet"`; engine and design work keep the default model.
- Long commands (builds of the whole tree, full tiers, conformance, benchmarks) run in the background; keep working while they run.
- Never stop to ask the owner a question during the loop (see "Decide alone" above): research, decide, record, continue.
- Never take the focus: every app or window you start while the owner works runs with `ZINC_BACKGROUND=1` (or `zinc --background ...`), and nothing you start is left running ("Never take the focus" in AGENTS.md).
- Changelog: a change a user can see adds one plain line to `## [Unreleased]` of `CHANGELOG.md` in the same commit ("The changelog" in AGENTS.md); `make release` publishes it.
