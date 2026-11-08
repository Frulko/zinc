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

- Review: all 8 results in (shards A-F, later-engine 31 tasks, later-demos-cross 34 tasks). Applied (946f68ef2, b464c3f25, be5ee42a3).
- ZN-863.02/.05/.07 integrated (07eae3e87, a2df0d896, 8217555a5). Worker 3: ZN-774.21/.23/.22/.27/.24 (docs, onboarding). ZN-1007/802 integrated (c9a244e69, 54a7888d7; cli_core.cpp conflict with ZN-793 merged by hand). Worker 6: ZN-1041, ZN-963, ZN-795. ZN-1014 partly done, integrated (3c063b453): lint goldens left (main tree vs worktree paths, hero/esp32 matrices to judge on a fresh build). Network outage 2026-11-07 evening: agents resumed.
- ZN-799 integrated (a8a1f93f1). ZN-699/794/793 integrated (eeb918684, 15fc4e76c, e86dcb379). Worker 5: ZN-1003, ZN-158 (checker assignability, typed arrays).

## Pending writes

- (none: written in 396eed2b1)

## Test machines (owner, 2026-11-07)

- Cross lane open: the Pi 3B+ player spark@192.168.2.31 and the Mojave Intel Mac mowmow@192.168.2.215 (AGENTS.md "The test machines"). One worker lane may take cross tasks these machines can prove; cross builds count as a building tree.
