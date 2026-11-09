# Coordinator loop, 2026-11-07 (owner: close as many tasks as possible by tomorrow, in full autonomy)

The method now lives in the skill `.agents/skills/zn-coordinate/SKILL.md` (shared by Claude Code and Codex, integration through `tools/integrate`); the steps below are the 2026-11-07 original. This file keeps the State log.

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
- Integrated: ZN-1069 (D225). Integrated: web chain ZN-1065, ZN-693 (D226).
- Worker: ZN-1070 AppKit primitives (claimed 6e23af277), beside the web chain.
- Integrated: ZN-1012 (Backlog, D227). Worker: ZN-1024 (save-to-frame 200 ms, second pass), beside ZN-1070.
- Integrated: ZN-1070 (Done, D228). Worker: ZN-1071 AppKit window chrome, beside ZN-1024.
- Integrated: ZN-1024 (Backlog, D229). Worker: ZN-1030 (open records, criterion #1) and the ir.sh goldens, beside ZN-1071.
- Integrated: ZN-1071 (Done, D230). Worker: ZN-1072 AppKit Table and Outline, beside ZN-1030.
- Integrated: ZN-1030 (Backlog, D231). Worker: ZN-610 (mqtt TLS 1.3) and the `--native` run cache that misses edits, beside ZN-1072.
- Integrated: ZN-1072 (Done, D232). Worker: ZN-1073 AppKit controls and overlays, beside ZN-610.
- Integrated: ZN-610 (Done, D233). Worker: ZN-1062 tabular figures, beside ZN-1073.
- Integrated: ZN-1062 (Done, D234), ZN-1073 (Done, D235). Workers: ZN-1075 custom native components and ZN-364.01 animated native driver.
- Integrated: ZN-1075 (Done, D236). Worker: ZN-1074 appkit-tour (with the AOT native-measure check), beside ZN-364.01.
- Integrated: ZN-364.01 (Backlog, D237). Worker: ZN-798 five frontend defects, beside ZN-1074.
- Integrated: ZN-1074 (Review, D238). Worker: ZN-682 zinc:3d node bounds, beside ZN-798.
- Integrated: ZN-798 (Done, D239). Worker: ZN-774.29 compiler-to-wasm spike, beside ZN-682.
- Integrated: ZN-682 (Done, D240). Worker: ZN-675, ZN-639 and the readonly-in-if/else checker gap (Z0111) found by ZN-682, beside ZN-774.29.
- Integrated: ZN-675, ZN-639 (Done, D241). Worker: Hamlet chain ZN-946, ZN-970, beside ZN-774.29.
- Integrated: ZN-774.29 (Done, D242). Worker: ZN-774.30 the /play/ page, beside Hamlet.
- Integrated: ZN-946, ZN-970 (Done). Worker: ZN-971 Hamlet command log and replay, beside ZN-774.30.
- Integrated: ZN-774.30 (Done, D243). Worker: ZN-437 zinc assets check and report --diff, beside ZN-971.
- Integrated: ZN-971 (Done). Worker: ZN-973 Hamlet chain 3 (farm, mill, bakery), beside ZN-437.
- Integrated: ZN-437 (Done, D244). Worker: DevTools chain ZN-709, ZN-704, beside ZN-973.
- Integrated: ZN-973 (Done). Worker: ZN-278 style levels warning (Hamlet ZN-951 and ZN-967 are parked), beside the DevTools chain.
- Integrated: ZN-709, ZN-704 (Done, D246). Worker: ZN-1028 zinc:net server limits and streaming bodies, beside ZN-1054.
- Integrated: ZN-1054 (Done, D247). Worker: UI style chain ZN-260 (box shadow layers), ZN-257 (border model), beside ZN-1028.
- Integrated: ZN-1028 (Review, D248; Pi unreachable by ssh for #3). Worker: web environment chain ZN-705, ZN-706, beside the UI style chain.
- Integrated: ZN-260, ZN-257 (Review, D250). Worker: system chain ZN-394, ZN-249, ZN-243 (macOS window tests, transparency and vibrancy, Linux deep links on the Pi) beside the audio chain.
- Integrated: audio chain ZN-697, ZN-440.02 (D251) and system chain ZN-394, ZN-243, ZN-249 (Review).
- Workers: audio chain ZN-695, ZN-440.01 and GL chain ZN-678, ZN-444. Integrated: GL chain (D252, D253). Worker: web dev chain ZN-1033, ZN-863.06. Integrated: audio chain ZN-695, ZN-440.01 (D254). Worker: assets chain ZN-674, ZN-442. Integrated: web dev chain ZN-1033, ZN-863.06 (D255), assets chain ZN-674, ZN-442 (D256).
- Workers: QuickJS boundary chain ZN-601, ZN-596 (numbers indicative, quiet-machine measure for the owner) and iPod chain ZN-1049, ZN-1048. Integrated: ZN-601, ZN-596 (Review, D257), ZN-1048, ZN-1049 (Backlog, D258). ZN-1077 (blocks ipod: checker regression) created and given to a worker. Integrated: ZN-1077 (81e7592e3); ZN-1049 to Review. Worker: ZN-569. Integrated: ZN-1047 (D259). Worker: runtime chain ZN-703, ZN-161.01. Integrated: ZN-569 (D260). Worker: museum editor ZN-1040; docs agent (sonnet, no build): ZN-1013. Integrated: ZN-1013. Owner: Quiet design parity ZN-1078 created (29 subtasks, M32), first in the order. Worker (no engine build, uses the smoke tree's binary): ZN-1078.01-.03 design, Quiet theme, size gate. Integrated: ZN-1040 (Review, D261). Worker: ZN-429 (AOT .incbin; ZN-1067 released: runtime/hal.h while ZN-703 holds the runtime and the other session edits hal.h); docs agent: ZN-1012. Integrated: ZN-703, ZN-161.01 (D262, D263), ZN-1012 (D264). Worker: ZN-1024 (dev loop 200 ms). Integrated: ZN-429 (Done, D265); smoke `aot_incbin`, `doc` passed (doc fixed: map overview to .mdx, gestures anchor). Integrated: ZN-1078.01, .02 (Done, D266), .03 (Backlog: AOT plugin linking fix); smoke `kit_quiet`, both templates checked.
- Integrated: ZN-706 (Done), ZN-705 (Review, D249). Worker: audio chain ZN-697 (voice fade), ZN-440.02 (streaming music from a ZPK pack), beside the UI style chain.
