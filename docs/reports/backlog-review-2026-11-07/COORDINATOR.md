# Coordinator loop, 2026-11-07 (owner: close as many tasks as possible by tomorrow, in full autonomy)

Each iteration (a wake-up or an agent's notification):

1. `.paused` exists: stop the loop.
2. **Review** (once): when the six `shard-*.json` and the two `later-*.json` are written and `applied.json` is not, start one apply agent
   (default model) that merges them as the 2026-10-25 review did (`docs/reports/backlog-review-2026-10-25.md`): verdicts applied, later.md
   lines promoted into tasks (commit trailer `New-task: owner backlog review 2026-11-07`), new ordinals (score of BRIEF.md, effort counted
   twice, maturity mark added), `applied.json`, `docs/reports/backlog-review-2026-11-07.md`. Tasks claimed by workers are left alone.
3. **Workers**: keep two building worker agents (worktree, default model), each on a chain of one module from `tools/next-task --list 10`,
   claimed first (`tools/next-task --claim`, commit the task files). Never two in the shared core (IR, runtime, raster, layout, text, ui.ts).
   Non-building agents (docs, tests, research) may run beside them.
4. **A worker reports**: `git cherry-pick develop..<branch>`, `tools/build zinc`, one short smoke run of the integrated feature, write its
   decisions, later.md lines and numbers, `git worktree remove`, `git branch -D`, then start the next worker.
5. Tests: never a suite (AGENTS.md "Move fast"); heavy tests go to "Tests to run" in `RESUME.md`.
6. Fallback wake-up 1800 s; notifications wake the coordinator first.

## State

- Review: 6 shards + 2 later agents running (started 2026-11-07).
- Worker 1: ZN-863.02, ZN-863.05, ZN-863.07 (web export).
- Worker 2: ZN-799 (first-project polish).
