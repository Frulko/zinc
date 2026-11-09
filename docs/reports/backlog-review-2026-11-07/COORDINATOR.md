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
- ZN-863.02/.05/.07 integrated (07eae3e87, a2df0d896, 8217555a5). Worker 3: ZN-774.21/.23/.22/.27/.24 (docs, onboarding). ZN-1007/802 integrated (c9a244e69, 54a7888d7; cli_core.cpp conflict with ZN-793 merged by hand). ZN-1041/963/795 integrated (490e58545, 1b08cc2f3, d62c4c1a5). ZN-1003 integrated (5fcb71637), ZN-158 handed over (7572c32c2). ZN-774 chain integrated (e0c63d201..705cff04a; 774.23 handed over). UI chain integrated (4768dc51c, 83b42deb1, 1687755bd; D207). Language gaps chain integrated (e94dfbf9b, 88f4ab8fe, 5793c0249). CLI tooling chain integrated (3a2093a4b, 2bb9983f5, 2c4ec1bd4; D208). UI gaps chain integrated (1d53cab27, 48d387893, 1e346e39c). QuickJS chain integrated (7cd337829, fc594d4a9, 0ccd06e55; D209). Worker 13: ZN-1031, ZN-640, ZN-1020 (devtools). jsx_gaps AOT segfault: not on clean develop, comes from the main tree's uncommitted src/rt work. Main tree: other session's ui.ts WIP breaks UI runs here; smoke UI tests in a clean worktree with ZINC_ROOT. ZN-1014 partly done, integrated (3c063b453): lint goldens left (main tree vs worktree paths, hero/esp32 matrices to judge on a fresh build). Network outage 2026-11-07 evening: agents resumed.
- ZN-799 integrated (a8a1f93f1). ZN-699/794/793 integrated (eeb918684, 15fc4e76c, e86dcb379). 

## Pending writes

- (none: written in 396eed2b1)

## Test machines (owner, 2026-11-07)

- Cross lane open: the Pi 3B+ player spark@192.168.2.31 and the Mojave Intel Mac mowmow@192.168.2.215 (AGENTS.md "The test machines"). One worker lane may take cross tasks these machines can prove; cross builds count as a building tree.
- Integrated: devtools chain ZN-1031, ZN-640, ZN-1020 (D211) and export chain ZN-797, ZN-816, ZN-817 (D212), smoke tests pass in a clean worktree with ZINC_ROOT.
- Integrated: runtime chain ZN-643, ZN-1015 (Review), ZN-1005 (D213) and tools chain ZN-1063, ZN-774.25, ZN-774.18 (D214). AOT smoke tests run from the main tree (not with ZINC_ROOT: rt.h WIP mismatch).
- Integrated: checker chain ZN-1035, ZN-389 and multi-window ZN-1032 (D215); UI smoke tests ran on the agents' own develop-based binaries (main tree ui.ts WIP breaks UI programs).
- Integrated: RN chain ZN-1064, ZN-812 and QuickJS web chain ZN-815, ZN-708 (D216). Smoke tree kept: .claude/worktrees/agent-aae96db4e67d4b8e6 (reset to develop, tools/build zinc, ZINC=$W/build/zinc tests/run --only ...); it counts as a building tree while it builds.
- Integrated: GL replay chain ZN-182, ZN-183, ZN-666 (Review) (D217). Integrated: dev loop chain ZN-1026, ZN-1024 (Backlog, 1.2 s vs 200 ms) (D218), with the coordinator's background-build guard 3b149c4df.
- Integrated: JS games chain ZN-1042, ZN-1043 (D219); webenv T0 fixed (page URL global).
- Integrated: ZN-805 (D221, perf lines logged, Done). ZN-1024 released for a later perf pass.
- Integrated: CLI chain ZN-1016, ZN-644 (D220).
- Integrated: bytes chain ZN-1019, ZN-698 (D222); runtime.h row conflict with ZN-805 resolved (gfxIdleDue, then the bytes rows).
- Integrated: layout chain ZN-1022 (Review), ZN-263.02 (Review), ZN-291 (moved to the cross pass) (D223). Skipped for agents: ZN-203.06 (needs the WebGL conformance run), ZN-713 (a measurement alone on a quiet machine), ZN-1067 (needs the Pi shell).
- Integrated: WebGL and gestures chain ZN-567, ZN-684 (perf line logged).
- Integrated: compiler chain ZN-376, ZN-667, ZN-1030 (Backlog) and ZN-796 (Review), ZN-1052 (Review) (D224, perf lines logged).
