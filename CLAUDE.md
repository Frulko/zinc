@AGENTS.md

## Claude Code

- `/loop /zn-start` runs the backlog on its own: one task per iteration, `/zn-end` closes it and names the next one. `/zn-start <id>` works one given task. Both are in `.claude/commands/`.
- Use sub-agents for research and independent investigations (several at once when the questions are independent) and keep their findings in `docs/reports/`; read a delegated result instead of redoing the search.
- Long commands (builds of the whole tree, full tiers, conformance, benchmarks) run in the background; keep working while they run.
- Never stop to ask the owner a question during the loop (see "Decide alone" above): research, decide, record, continue.
