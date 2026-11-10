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

- Dashboard root check/original interp4 PASS; light native and360px form inspected, token eye aligned. Provenance dashboard_integration recorded, worker scratch/source hashes archived.51Done. Active Gallery20/Settings23/Finance24 on397865, no core writer.

- Dashboard22 integrated1d67788cf Done,51Done; local build desk uses existing kit, actual all3 actions and9 inspected light/dark/narrow pictures pass, root check/interp4queued. Minimal heading parity case passes; original title visual difference recorded without override. Reserve Finance24 fresh worker, dependencies Charts/Data Done, pinned CUI finance.c researched; Gallery20/Settings23 continue.

- Root Extended integration PASS:12 exact model/API/UI paths all3, production native drop scope and original QJS4frames; capture360/dark social inspected. Provenance after_extended,50Done. Settings23 active with Gallery20/Dashboard22; engine397865 remains unchanged. Completed Extended logs/checkpoint archived before tree removal.

- Extended19 integrated720f15378/becf01193 Done,50Done; final combined unchanged gate JS235962/246177/282882, unused10215<10240(25B margin),4078/component; AOT5325320/5474000/6025760. Lazy native System factory removes unused plugin, selected native drop scope proved; secondary-window HAL gap remains later. Root exact integration proof queued. Reserve fresh Settings23 (reference CUI pinned settings.c inspected), beside Gallery20/Dashboard22.

- Root integration checks completed: jsx_map_trailing/kit_ai/kit_planning and unchanged gates PASS, original AI composerQJS4/Tracker check+interp4 PASS;49Done. Common397865 frozen, source90b compiler/d950 smoke tree. Extended19 completee31e822f4, short final rebase/combined gate requested; Gallery20/Dashboard22 active. Completed worker archives removed safely; no core writer. Raw provenance after_ai_planning in kit-integration JSON.

- Planning17 integratedb4edca089 Done, correct BoardCard key fixes React focus; actual final T0 all3/bothmodels and six refreshed captures/gate pass, closes1110 AC3. Tracker21 integratedd950a9460 Done: all3 real actions/light-dark/narrow proof, no new demo tests.49Done including1110; root integration smokes underway. Reserve Gallery20 and Dashboard22 fresh TS-only demo workers while Extended19 finalizes. Gallery must include Extended after integration before claiming full coverage; preserve focused screenshot modes. No engine writer, common397865 frozen.

-1110 tested compiler source integratedebe53adf2 AC1/2; original formatted Month gallery/repro all3 pass, AC3 waits Planning React keyboard-drop focus fix. AI18 integrated90b24121b Done,46Done; fullall3/bothmodels/gate pass, root newcommon build/proofs pending. Reserve fresh Planning completion from parked78c13d3ea (normal formatting; no removal workaround) and DemoTracker21. Gallery20 final completeness waits open17/19, so independent Tracker21 proceeds (formal Nav/Feedback/Data depsDone). Extended19 uses CUI-exact injected Browse callback, no permission-collector task1111 needed; native user-picked drop grant correction authorized at System owner, strict scope proof pending.

- Planning17 parked clean checkpoint78c13d3ea, NOT integrated, all AC open: formatter adds valid trailing comma in map callback and JSX rows disappear. Minimal persistent repro/logs and primary ECMAScript/Prettier references recorded; reserve1110 for fresh sole core worker. Keep normal formatted source, no comma-removal workaround. Slot freed by Planning; AI18/Extended19 continue independently on commonf561. System events lazy/disposer change remains plugin TS scope, no core writer conflict.

- Media16 integratede70c008e2 Done/released,45Done: four controls, nine model/UI programs all3, eight inspected pictures, overlays and Discord compatibility checks, unchanged combined gate PASS4085JS/61306AOT. Existing modal kept with shared geometry/owned lifecycle/sharper cleanup; Tooltip disposer ownership fixed once. Root TS-only smoke underway, commonf561 unchanged. Reserve Extended19 fresh worker beside Planning17/AI18; real system drops via existing plugin, controlled UI models/animations, no duplicate services or engine work.

- Root Tool14 integration modelT0 all3, shared kit_inputs, gallery check and4frame graphQJS PASS.44Done persisted; Tool source/gate hashes added to kit-integration after_tool_panels, perf appended without owner hunks. Completed Tool tree archived/removed. Active Media16/Planning17/AI18 all TS-only on commonf561, no engine writer; next family19 when slot free. PropertyInspector duplicate-label polish and typed-unknown identity/percent class findings remain later.md, no new task.

- Tool14 integrated23cdd66a0 Done/released,44Done. Final worker all3 models,30keyboard/24pointer routes,ten inspected pictures and combined original gallery/check/gate PASS; root TS-only integration smoke underway on commonf561. Gate JS235962/242570/279337 (4085/component,97strictBheadroom), AOT5325320/5457488/6009248 (61306/component), no engine rebuild. Reserve fresh AI18; coordinator primary CUI/provider research recorded before claim. Media16/Planning17 remain active; all use commonf561, no core writer.

- Final common rebuilt7774708ca SHA256f561c4cc76172c731e4109cd9161b5a7092ffda9553260f25351a0a1e329fce1; root optional_collection/method_defaults/lucide_serialization/kit_charts/gate PASS plus gallery check/3frameQJS. Charts15 closed,43Done. JS4085/component/97B strict headroom; AOT61306/component, native editor stilllinked underbudget/deferred. D274/provenance/perf/later updated. Active Tool14/Media16/Planning17 switched to common; no engine writer. Completed Charts/size/core trees archived, b96 engine retained in frozen complete package for diagnosis. External WIP stats unchanged.

- Lossless circle generator7774708ca integrated, Code13 Done on actual unchanged candidate gate: JS235962/241206/277973,4085/component,97B strict headroom; SVG extended oracle all3 byte-identical, cold cost unmeasured. Root clean final rebuild now running to combine1108/1109/Charts/circles before closing Charts. CodeSize agent ended; reserve Planning17 for fresh TS-only worker beside Media16/Tool14. Reuse dnd, picker-date, existing Calendar and Kanban example; no core overlap.

-1109 integrated51188abb0; original Tool models all3 and30/30 UI routes pass on b96e6cb7,1108 AC3 closed.41Done, both released. Core1108 agent finished; CodeSize now sole core generator writer, lossless circle prototype saves109B and preserves SVG bytes/metadata, actual oracle/gate pending. Reserve Media16 for fresh TS-only worker, reuse ImageViewer/image-cache and existing image providers; no runtime/core overlap. Common rebuild grouped with SVG correction, current85f6 and frozen candidate packages explicitly identified.

- Charts15 checkpoint e85f33a65 integrated/released Backlog AC1/2 complete, AC3 same12B strict shared excess with Code; all15 types/geometry all3/both-model UI and seven inspected pictures proven. Reserved fresh Code13 completion for shared size analysis; core access read-only until sole core1109 finishes. Existing lossless Lucide generator src/frontend/modules.cpp1537 is a lead (6459 d-only paths/540 standard circles catalog-wide), not permission to trim icons or hand-minify. Frozen1108 AOT bundle repaired with58 immutable archive clones from source-identical runtime build; Panels can finish its own gate without mutable artifacts.

-1108 checkpointb805f4819 integrated AC1/2, exact optional_collection all3/memory and original full gallery check27files PASS; runtime AC3 waits1109. Root rebuild grouped after1109 to keep the core lane moving; common85f6 binary remains frozen. Panels ten actual QJS routes pass; Charts final all3/both models pass and is capturing before combined gate. Code13 tree removed after archiving logs/checkpoint/stash patch under .logs/archive-completed-workers-20261110/1078-code; immutable backup stash retained safely, no shared reflog race.

- Code13 checkpoint8bbf8a245 integrated/released Backlog AC1/2 complete, AC3 open12 strict JS bytes; root exact all6/gallery check/3frame QJS original editor PASS. D277/provenance recorded. Fresh core1108→1109 started in work/1108, sole core writer, beside Tool14/Charts15.39Done unchanged; no UI/budget cut. Code completed tree logs/stash will be archived before removal.

- Reserved1109 after confirmed original Tool14 Terminal default-this regression: six lines fail RC verification on clean da7ca, source/log archived, ordinary method receiver/default semantics researched from ECMAScript. Fresh sole core chain1108→1109 next free slot; no control workaround. Code13 finishes truthful checkpoint AC1/2, AC3 open for12 strict JS bytes; other size gates and exact all6 pass.

- 2026-11-10: OptiPlex first actual proof PASS via Tailscale: unchanged nullable_numeric compiled x86_64-linux on Mac, remote timeout15/headless, exit0, SHA2567c6310a5f469884bef5d5572dd28cb11466d2508d585f3cfed408b4ac7e0ef3a; no process left. Nine completed clean trees archived/removed, active/common tree retained. Created/reserved1108 original Tool14 blocker: optional-chain array.find Z0106, direct call passes. Source/logs and primary semantics recorded; next fresh free slot takes sole core correction, panels continues independent work.

- 2026-11-10: Root clean da7ca0360 rebuild succeeded, SHA25685f6d02a26948c1755090b0c06b3a926cad5cefa6df1799ce01d737a13e28f68. Exact collection_results/nullable_numeric/text_offset/component_signal/Data12/Feedback and unchanged raw kit_size PASS. JS235962/239047/275739B,4076/component,172B strict headroom; AOT5325320/5374848/5926624B,61308/component. Data12/Feedback11 closed/released;39 distinct session tasks Done. D274–276 and tracked provenance recorded, external WIP preserved. Charts15 now active beside Code13/Tool14; no core worker. First bounded OptiPlex fixture cross-build started, target execution not yet claimed.

- 2026-11-10: Integrated1107 live getters4399fedce and1106 nullable numeric payload conversion da7ca0360; actual Code all six and Data twelve proofs pass.1105 AC3 complete. Root clean final rebuild/proofs queued; Code13 and Tool14 continue. Reserve Charts15 for a fresh inherited-model worker, TS-only, no second core writer. Owner added OptiPlex Intel Linux16GB: LAN mowmow@192.168.2.228 and Tailscale100.66.7.14 verified by SSH, no development tools/Zinc installed; build on Mac and deploy under owned ~/zn/name.

- Integrated1105 tested source-hit ed5150388 AC1/2, AC3Reactcaller waits1107. Reserved1107 shared componentSignal live-getter contract after originalCodeJson/link same-frame actions exposed React snapshot read; rawuseState unchanged. Fresh core order1105→1107→1106, three tasks, onlyown1106build canceled cleanly to unblockTSproof. Accidental main ui.d.ts generation was inspected/backedup/restored toknowncleanHEAD; later correct1105 dts integrated, external sparseMap nevercommitted. No owner source/index changes. CodeSolidall3 links pass; neutral exact1107all6 passes, originalReactproofpending.

-1101/1104/1103 integrated902de09c0/8c31f5cb7/20fc72043; root clean rebuilds and exactproject_cwd/library_icons PASS.1103 actual combined gate JS4076/AOT61308,172strictBheadroom; noUI/icon/budgetcut. Data/Feedback finalroot family/gate proof pending. Core1102 readyab4d4dd61; oldbatch ends after4, fresh1105/1106 handles text glyph/source-hit and accepted nullable numeric widening, no sixth task. Code13 source/provider/model proof advances; real inline links wait1105. Tool14 primary research complete, taskclaimed, nextfresh implementation worker. RESUME history archived then rewritten compactly.

- Reserved Tool panels14 for short primary-reference/provider research in a separate read-only worktree, then a fresh family worker. Code13 is implementing independent provider-backed controls; no second core writer. Feedback progress c9be3d26a integrated AC1/2 complete/AC3 size pending.1101 cwd and1104 reader fixes integrated; root rebuilt clean902 and8c, exactproject_cwd PASS, library_icons integration proof pending. Core1103 implemented prototype and reports actual unchanged combined JS4076/AOT61308 pass; final caller proof/commit pending.

- Claimed Code13 for a fresh independent family worker after the read-only1103 reviewer returned. Existing provider/CUI research is already in task notes; reuse editor/Markdown/inspector providers, no shared core edits or engine build. Current core handles1101/1104/1103/1102; Feedback finishes defaults/captures, Data source is integrated Backlog pending common gallery/size proof. This fills three worker slots without another coordinator or overlapping core writer.

- Data progress8f8478bd5 integrated, Backlog AC2complete; root merged publickit_data12-runPASSall3inclrealFS with1101candidate. Candidatefreeze releasedforCLInegativecase validation; no sourceworkaround. Reserved1103actualcombinedsizegate +1104full-AppQuickJSiconprobe fallback. Coreorder1101→1104→1103→1102, fourtasks. Feedback fullgalleryinterpreterpasses; unusedfullAppbody stilltriggersQuickJSfallback, simplebodydoesnot. Read-onlysizelead:100d-onlySVGpaths inprior41documents, privateconstructorreuse worthactualmeasurement. NoUIcut/budgetraise.

- Picker07 integrated9dc934f5f Done;1100nullableStringkeys integratedbaf4c2d0f Done;30sessiontasksDone. Core1097/99 rootexact tests PASS using frozen source-identical candidate; clean afce binary deliberately frozen for Data attribution until combined rebuild. Picker actualall3/sizePASS, six pictures+360px; shared Popup Quiet ring/header retained. New Feedback proof worker started onfreshworktree. Confirmed1101 QuickJSprojectcwd dispatcher returnsbeforetypedchdir; minimalfsmarker+bindingdocs, reservedforfreshcore. Preexisting values().length nativeiterator-vs-array mismatch being reserved1102. No external WIP changed; all key numstats identical.

- Closed/released1093/94/95/98 after originalData public-barrelall3×SolidReactMetric nine-runPASS and actualPickerstatefulall3 proofs;26tasksDone.1098 afceb812d cleanrebuilt/exactguarded_callbackPASS. Persistedconsumerprovenance. Reserved1100existingnullableStringSet/Mapruntimegap forfreshcore, notsixthcurrentbatch. Pickergate/behaviorgreen;Dataunusedgatefixedviaexistingpurehashhelper, usedJS209Bover andnaturalCarddefaultpropsbeingmeasured,noUIcut/budgetraise. Archived/removedsevencompletedcleanoldtrees;logs/checkpointsin.logs/archive-completed-workers.

- Integrated1096 pending-scroll0ee881168 +originalcallerclosure1d9e56589, releasedDone;22sessiontasksDone. Rootclean scroll_request PASS all3/classicYoga; actualWheel/Ruler/hiddenTimePickerQJSpass. Stashrestoreconflict resolvedpreservingowner'svRowH innewrowhelper; externalWIP42/19ui,12/0main,15/0perfunchanged,indexclean. Extraowner-sourceoverlayfailsPREEXISTINGunfinishedprependRowsmapmigration, leftownerWIPalone;cleandevelopPASS. Corecontinues1097/98/99. Dataexpandedprivate direct-familydiagnosticall3×bothmodelsPASS;originalbarrelstill1098blocked, noDoneclaim.

- Corrective1093 integrated0ae64e937, clean tree rebuilt and expanded exactjsx_idPASS. Archived completed1088coreproofs to.logs/archive-core-1088/core-proof; removed completedworktree/branch after checking replacement and notifyingworkers. No extra app/process.

- Created/claimed1099 nullable cleanup callback returns in Dyn-enabled graphs, confirmed by strict tsc and original Picker source. Sole corebatch nowexactlyfive1093 correction/1096/1097/1098/1099; no sixth. Root rebuilt1093 correctiveintegration and exactjsx_id replayinprogress. Fresh UIworkers add originalcallerfocused assertions and fixtheir ownfixturetargeting, no checkerworkaround.

- Created/claimed1097 iterable collection constructor inference and1098 guarded optional callable narrowing, each minimal actual caller blocker/strict tsc evidence and primary research recorded.1093 composed-ID corrective0ae64e937 integrated; new binary unblocks original IDs. Sole coreworker1096 handles corrections serially; UIworkers continue review/proof preparation. Inputs06/Navigation09 nowDone after clean currentgate and exactcaller replay.

- Integrated1088/1093/1094/1095/1090 through41c30e3ac;1088/1090Done, original consumerAC3 on1093/94/95 remains open. D270–273/provenance recorded. Restored external WIP numstats unchanged (ui42/19,main12/0,perf15/0), index contains only coordinator block. Clean retained engine rebuilt; root unchangedkit_sizePASS. Fresh workers Pickers/Data/core1096 running. Real callers found1093 composed-IDZ0107, constructor iterable inferenceZ0109 and guarded optionalcallbackZ0105; solecore fixes1093 first, no UI workaround. Pi final42/exit0, no remote process. Final JS4068/component (249B total headroom), AOT59472; no speed claim.

- Core warm build and exact layout/plugin/Script/ID/flatMap checks pass; neutral ownership, actual kit_inputs/overlays and original gallery smoke pass. Unchanged combined size gate passes at57,640B/component (direct5,308,712/index5,358,240/ten5,877,008), no runtime speed claim. Read-only review found/fixed recycled-row insertion and imperative toast owner leaks; shared host helpers transferred to core. Pi reachable through paired zinc-player despite SSH-agent auth blocker; one bounded cross proof is in progress.
- Created/claimed1096 after an actual3frame interpreter repro proves pre-layout scrollTo(0,200) becomes0. RN/Flutter primary research supports preserving pending intent. A fresh sole core worker takes it after the current five-task batch; do not append a sixth task. Picker checkpointb1b945b19 and Dataf048a55bf are private Backlog/allACopen, ready for fresh proof workers after core integration. Code13 reuse research saved in its unclaimed task.

- Created/claimed ZN-1095 after Picker static lowering proves neutral nested JSX bypasses React component ownership. Prepared runtime assertions are unrun; no cleanup/state pass claimed. Sole core batch now 1088 -> 1093 -> 1094 -> 1095 -> 1090 (five tasks). Picker checkpoint2476e9887 and Data checkpoint28095e6ca remain private Backlog, all criteria open, pending engine proofs and captures; no new UI feature chain yet.

- Core parked private1088 checkpoint e6d744868 (allACopen) after layout regressionPASS; nativeScript hostcontract test exposed missing transitive staticarchives, fixedsource unproved behindother-sessionMapperlock. Canceled onlyownqueuedbuild; now1093 then1094 then1090 source in same solewriter. Keep everycommitunintegrated until exactproof/fixups; no fabricatedDone. Pickers fullUnicode17catalog1914entries/9groups/330tones islazy/shakeable, ownruntime stillqueued.

- Created/claimed1094 for confirmed generic Array.flatMap gap blocking unchanged Data PathBar. Two-line nested-string repro failsZ0106; Data-subagent TC39 +vendoredQuickJS research recorded. Core order1088->1093->1094->1090 (four-task batch); one writer, no app workaround. Other potential picker scroll/neutral ownership failures await exactruntime proof before taskcreation.

- Created/claimed1093: ordinary JSX id is rejected by host attribute whitelist, blocking Data aria-activedescendant. Minimal3line check reproduced, Data-subagent WAI/React primary research recorded. Sole core order1088 then1093 then1090; no second enginewriter. Pickers string|| rejected by deliberatebooleancondition policy, uses explicit emptyselection; no invented gap/task. DirectReactimport in neutralData UI belongs sharedkit host provider; adjustlayering and record existing inference issue later if needed. Other session relaunches Mapper3600s, so all runtime/build checks queued; bounded cheap static checks may proceed without executing apps.

- Claimed independent ZN-1078.12 Data after short CUI/APG/provider research. Fresh TS-only worker work/1078-data uses existing virtualization/resize/dialog/breadcrumb controls, no engine build. Pickers and Data own separate family/gallery modules; shared exports/docs integrated serially. Source preparation proceeds while known1088/1090 gates and another session’s long Mapper app hold validation. No workaround or false Done. Read-only review/research trees1088-size-review and1090-research removed after findings were handed off.

- Resume already-reserved ZN-1078.07 Pickers in fresh work/1078-pickers, TypeScript family only, no engine build. The core writer stays sole engine owner on1088/1090; independent picker implementation/reuse research proceeds while the global heavy queue is occupied by another session’s bounded Mapper app. Known size/icon criteria remain open until fixed, no source workaround or budget raise. Future workers inherit configured model.

- Closed/released1087/1089/1091/1092 after full ordinary-default UI proof and clean exact T0s;17 tasks closed this session. Owner then chose Astra Fast and switched back: inherit prior/configured model for new workers, preserve Fast/optionaloverride. Astra1088 checkpoint e020951cc remains unintegrated, finalusedgate72312>65536, unusedpasses; no1090code. Feedbackcleanup patch saved, no oldworkersrunning. Fresh core+read-only size attribution resumes from new worktrees; preserve all artifacts.

- Galleryc59fa16fa and nativeaspectb189f5bab integrated. New fresh1087 proof worker will own remaining owner default resize/scroll criteria; core handles1092 before1088/1090. Inputs06/Navigation09 released with dependency1088;1091BacklogAC3 dependency1092 (not human Review). Existing clean kit_inputs/input/navigation PASS. Preserve old source artifacts; no new feature chain while engine blockers remain.

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

- Additional machine (owner2026-11-10): OptiPlex Fedora45 x86_64, i3-7100T,16GB; `mowmow@192.168.2.228` or Tailscale `mowmow@100.66.7.14` / `optiplex.tail80b63.ts.net`. SSH verified both routes. No compiler/build tools/Zinc initially installed; cross-built bounded programs in owned directories first.
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
