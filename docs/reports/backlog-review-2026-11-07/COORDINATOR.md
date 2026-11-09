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

- Claimed1092 after independent17line ordinary-View repro confirms nestedwrap stale parentheight causes768px gallery overlap. Sole core order:1089done,1091aspect,1092wrap,1088size,1090icons (five-task maximum batch). Gallery1087 commits own UI progress without workaround; Feedback awaits shared fixes.

- Owner gallery1087 default resize is blocked by confirmed SDL aspect lock left active when hal_set_resize switches to fill. Claimed1091; sole core worker handles immediately after integrated1089(cf0b4c9e0), before size1088/icons1090. Minimal repro /tmp/1087-proof/resize.tsx; no ZINC_RESIZE workaround. Gallery/Feedback workers keep own source.

- Common engine chain claimed:1089 reset evaluated compositor values,1088 retain only needed standalone type/code metadata,1090 reached-library default icons. Fresh sole core worker replaces returned Navigation worker; works in that order, separate commits. Inputs0a8c0b141 and Navigation3dde12a02 progress integrated, size ACs open. Gallery1087 owner fix and Feedback11 continue independently. No UI source workarounds or budget changes.

- Owner screenshot correction takes priority: ZN-1087 claimed for docs/img/design/src responsive gallery and real aligned password reveal; fresh worker replaces finished Inputs. Inputs progress0a8c0b141 integrated, AC3 remains open on new-source AOT metadata costs. Navigation/Feedback continue; queue common engine metadata/animation blockers when a worker slot returns.

- Recorded/released ZN-1085/1086 and .10; Selection .08 size AC now passes and task Done. Clean rebuilt engine: tdz_outline, ui_focus_dispose, kit_overlays, original gallery check/run and unchanged kit_size all PASS (62412 B/component). RESUME archived losslessly then shortened for fresh-worker context. Active: Inputs, Navigation, Feedback; no process left by root.

- Core c69f4e7a8 (TDZ shared error construction) and8fc1bb2d1 (focused subscription snapshot) integrated. Core slot now becomes fresh Navigation worker ZN-1078.09, claimed in work/1078-navigation. Inputs and Overlays finish their actual caller proofs; root owns clean engine rebuild/integration checks. Three worker slots stay occupied.

- Recorded/released ZN-1084, D269: clean bench_harness and focus-disposer T0 PASS; preserve three small artifact JSONs. Workflow51326feea persists automatic queue and five-worker CLI launch setting (new sessions only). Current three workers: Inputs, Overlays, core1086 then1085 correction. Size core gate is green; family workers validate against that binary before closure.

- Reopened ZN-1085 AC2/3 after real Inputs React MoneyField found registration-while-focused snapshot=false misses blur. Existing disposer commit remains integrated; core worker1086 fixes this in a separate1085 commit after finishing its size change. No new task, no UI workaround, no parallel shared-core editing.

- Focus disposer d78054826 integrated; Inputs and Overlays migrate their own subscriptions. Claimed ZN-1086 to restore unchanged AOT kit size budget through measured engine code/metadata work (D268 revisit), never kit source contortions or raised limits. New core worker replaces finished1085; no other shared core source worker active.

- Created/claimed ZN-1085: focus-within registration disposer blocks repeated React Tooltip/HoverCard/Inputs cleanup. Harness e426a7560 integrated, core source ownership now free; fresh TS-only core worker will implement API, kit workers migrate their own callers. Size optimization follows this concrete lifecycle blocker; no local callback registry workaround.

- Recorded/released Selection .08 and unstarted.09; clean integrated kit_selection/kit_selection_native PASS. .08 staysBacklogAC3 size-only failure, no repeated microtrims. Temporary identical artifact sizes across branches are consistent with page/link rounding; no demonstrated cache defect. OldSelection tree removable.

- Selection .08 progress integrated53009551b: feature/React/native proof green, AC1/2 complete, task BacklogAC3 unchanged AOTsize gate66081>65536. .09 unstarted. Fresh Overlays worker resumes checkpointf300498dc in work/1078-overlays-resume; Inputs and harness continue. Owner asked kit testing: quiet/input/actions/chrome T0 PASS, clean gallery check/headless capture PASS, bounded background interactive window60s.

- Integrated/released ZN-1083 (3e0a6bf2a, Done), clean six-case jsx_show and targeted kit_actions/kit_chrome/ui_focus_dispose PASS. Remove completed1083 tree. Three active workers: Inputs, Selection and priority harness1084. Internal host.componentRef addition transferred from Inputs to Selection to avoid duplicate commits; integrate Selection first. All heavy commands self-queue with shared flock.

- Owner priority: apply GPUI/zgui recommendations to harness FIRST, then speed/agent capacity. Created/claimed ZN-1084; fresh harness worker replaces checkpointed Overlays worker. Overlays branch work/1078-overlays clean checkpoint f300498dc, NOT integrated, .10 Backlog/unproven, .11 unstarted; resume later. Runtime/build self-queue now /tmp/zinc-heavy-run-501.py SECONDS COMMAND (fcntl+timeout, self-check PASS), no parent permission handshake. Inputs and Selection continue autonomously, one heavy command at a time.

- 2026-11-09 owner asks more agents/testing and GPUI critique applicability. Claimed Overlays/Feedback .10-.11 for third worker (no engine build); research already completed before launch to fit4-agent cap. Inputs/Pickers and Selection/Navigation continue. Root targeted user-requested jsx_show, kit_actions, kit_chrome, ui_focus_dispose PASS. GPUI review read-only, no new tasks from article; preserve existing backlog freeze.

- 2026-11-09: Created/claimed ZN-1083 (blocks RadioCards): complete mapped/multiple Show children must use existing fragment emission. Research completed from Solid/React/TS primary docs. New core worker work/1083-show, one engine build maximum currently. Selection may separately build only AppKit mixed-state plugin (second tree), but native fixture waits Show fix; no concurrent runtime tests. Inputs gets retained artifact size attribution first, no source contortions or budget change.

- 2026-11-09: Integrated ZN-1082 (c1c330cfa, Done); clean retained binary rebuilt, jsx_grab actual arbitration PASS all6 model/engine combinations, solid fixture check PASS. Original Slider horizontal/vertical all3 proof passed. Core worker clean/no processes; remove work/1082-grab. Next1083 Show direct-map/sibling lowering research completed; original RadioCards unchanged. Inputs source frozen at4912B used-component size overage pending retained artifact attribution and Money focus subscription correction.

- 2026-11-09: Created/claimed ZN-1082 (blocks Selection slider): dynamic grab binding rejected by literal-only frontend. Exact existing enum keep/keep-x/auto only. Short primary-source research completed; fourth agent slot reserved for one core worker, no further UI research until released. Inputs has next bounded proof batch; engine worker must avoid final link while it runs.

- 2026-11-09: Inputs exact kit_inputs/kit_input PASS after render-slot, disabled API and engine autofocus corrections; final captures/gate ongoing. Selection .08 worker explicitly owns minimal Actions.groupButtons correction from getNumber(disabled) to ui.isDisabled plus disabled-middle-item focus regression (shared Selection keyboard behavior, no new task); no other worker edits actions.tsx.

- 2026-11-09: Claimed Selection/Navigation ZN-1078.08-.09, new work/1078-selection in .worktrees/1078-selection, no engine build. Inputs/Pickers .06-.07 active in its own tree. Separate family modules/gallery sections; Selection docs insert before How it works while Inputs appends after App chrome to avoid shared append conflicts. Both use latest retained clean binary with ZINC_ROOT.

- 2026-11-09: Integrated ZN-1080 (1ccc941a7, Done), only c7d77cdfb after clean branch reset/rebase;1081 was not duplicated. Clean retained tree rebuilt, jsx_input_mode PASS Solid/React×interpreter/nativeAOT/QuickJS, solid fixture check PASS. Original Inputs production source all3 proofs green; .06 authored interaction checks still being corrected. Core worker clean/no processes; remove completed work/1080-inputmode. Next chain Selection/Navigation .08-.09 beside Inputs/Pickers.

- 2026-11-09: Integrated ZN-1078.04 (fed3600d1) and .05 (fc75c5744), Done. Clean retained tree kit_actions, kit_chrome, ui_dnd and kit_size PASS; short chrome run exits0 and documentation pictures inspected. No C++ rebuild. Inputs/core workers rebased to these APIs;1080 ready c7d77cdfb with all3 original Inputs proofs, separate authored event bounds failure remains .06. Actions worker clean, no processes; remove its finished tree/branch.

- 2026-11-09: Integrated ZN-1081 (1b8b79f99, Done), ui_focus_dispose PASS on clean develop across all3 engines, original same-frame Dock cancel/repeat drag green. TS-only, no engine rebuild. External Virtual/Fenwick WIP restored. Retain work/1080-inputmode for active worker; clean reset to develop required before1080 so its old1081 commit is not cherry-picked twice. Actions rebases/finalizes .05; Inputs waits Button APIs and1080.

- 2026-11-09: Created/claimed ZN-1081 (blocks actual App chrome docking): stale focus-within callbacks survive release and act on reused node slots. Core blocker chain will do1081 then1080 in work/1080-inputmode; one building worker plus two non-building kit workers. Main ui.ts WIP inspected: only Virtual/Fenwick at636/967, isolated release/focus lifecycle changes permitted near777/6282. No event timing or component workaround.

- 2026-11-09: Created/claimed ZN-1080 (blocks Inputs/kit-gallery): literal-only inputMode lowering rejects dynamic JSX. Short primary-source research completed by coordinator research agent; new frontend worker .worktrees/1080-inputmode, beside two non-building kit workers. At most one engine tree builds; main held UI/runtime modules remain excluded.

- 2026-11-09: Claimed Inputs/Pickers chain ZN-1078.06-.07, new .worktrees/1078-inputs, no engine build. Actions/App chrome worker owns button, menus, dnd and gallery shared wiring until its report; Inputs worker owns input/picker modules and separate gallery sections, shared docs/exports require coordination. Both use retained clean smoke binary with explicit ZINC_ROOT.

- 2026-11-09: Integrated ZN-1079 (4004c3b7e, Done). Clean smoke rebuilt; jsx_map_local passes Solid/React on interpreter/QuickJS, original Save/Export scene inspected. Worker proved original repro on native AOT; Actions original palette proof passes. Actions isolated kit_size passed; .04 commit then .05 proof ongoing. Next chain: Inputs/Pickers ZN-1078.06-.07.

- 2026-11-09: Claimed ZN-1079 for a fresh frontend/JSX worker in .worktrees/1079-jsx, beside the Actions/App chrome worker. At most one engine worker builds; no other build process observed.

- 2026-11-09: Integrated ZN-1078.03 (7273abc75, Done, D268). Clean smoke tree rebuilt; native_reachability, res_library, kit_size pass, Button checked and two frames inspected. AOT barrel +66,040 B / 106,496 B budget; JS +395 B. Original main.cpp cross-display WIP and tests/affected.json WIP restored. ZN-1079 follows next; Actions/App chrome worker remains active pending its JSX fix.

- 2026-11-09: ZN-1079 created under the blocks exception for kit-gallery command palette (block-bodied JSX map returns a local node but prints numeric handles). Queued immediately after ZN-1078.03; Actions keeps original code and continues unrelated work. Size worker may make minimal non-overlapping main.cpp reachability wiring: current external WIP there is only on-demand cross-display collection near line 3632.

- 2026-11-09: live Codex coordinator active (root session, native sub-agents). No other coordinator process or codex-loop lock found; .paused absent. Main-tree WIP in runtime/host/display/LVGL/ui.ts/main.cpp is owned by another session; no builds or feature runs here. Reserving ZN-1078.03 (size gate, IR/AOT reachability; avoid held files) and ZN-1078.04-.05 (Actions/App chrome, no engine build). Existing clean smoke tree retained.

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
- Workers: QuickJS boundary chain ZN-601, ZN-596 (numbers indicative, quiet-machine measure for the owner) and iPod chain ZN-1049, ZN-1048. Integrated: ZN-601, ZN-596 (Review, D257), ZN-1048, ZN-1049 (Backlog, D258). ZN-1077 (blocks ipod: checker regression) created and given to a worker. Integrated: ZN-1077 (81e7592e3); ZN-1049 to Review. Worker: ZN-569. Integrated: ZN-1047 (D259). Worker: runtime chain ZN-703, ZN-161.01. Integrated: ZN-569 (D260). Worker: museum editor ZN-1040; docs agent (sonnet, no build): ZN-1013. Integrated: ZN-1013. Owner: Quiet design parity ZN-1078 created (29 subtasks, M32), first in the order. Worker (no engine build, uses the smoke tree's binary): ZN-1078.01-.03 design, Quiet theme, size gate. Integrated: ZN-1040 (Review, D261). Worker: ZN-429 (AOT .incbin; ZN-1067 released: runtime/hal.h while ZN-703 holds the runtime and the other session edits hal.h); docs agent: ZN-1012. Integrated: ZN-703, ZN-161.01 (D262, D263), ZN-1012 (D264). Worker: ZN-1024 (dev loop 200 ms). Integrated: ZN-429 (Done, D265); smoke `aot_incbin`, `doc` passed (doc fixed: map overview to .mdx, gestures anchor). Integrated: ZN-1078.01, .02 (Done, D266), .03 (Backlog: AOT plugin linking fix); smoke `kit_quiet`, both templates checked. Integrated: ZN-1024 (Backlog, D267; 450-600 ms); smoke `hot_recompile`, `rc_borrow`, `aot_incbin`, `kit_quiet`, hero passed. Loop handed to Codex (tools/codex-loop), owner 2026-11-09.
- Integrated: ZN-706 (Done), ZN-705 (Review, D249). Worker: audio chain ZN-697 (voice fade), ZN-440.02 (streaming music from a ZPK pack), beside the UI style chain.
