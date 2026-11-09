# Resume — 2026-11-09

## Active coordination

- Continue zn-coordinate until the main repository `.paused` exists or nothing can start. Never ask the owner a question. One coordinator: this root session; state log is [COORDINATOR.md](docs/reports/backlog-review-2026-11-07/COORDINATOR.md).
- Active workers: sole core, Pickers and Data; each has its own worktree. Every command runs in its own worktree; source and ownership below. They use zn-start, no suites, no push.
- This session closed17 tasks: ZN-1078.03/.04/.05/.08/.10 and ZN-1079/1080/1081/1082/1083/1084/1085/1086/1087/1089/1091/1092. Full integration history and older unresolved handovers/tests remain in [the archived resume](docs/reports/session-handover-2026-11-09.md); read only the relevant topic.

| Worker | Branch/worktree | State and next step |
| --- | --- | --- |
| Core handoff | work/1088-resume, .worktrees/1088-resume | Restore unintegrated checkpoint e020951cc with cherry-pick -n; complete1088 then1093(id) then1094(flatMap) then1090. Prior Astra tree1088-astra and old1089-core are read-only evidence. No active old writer. |
| Pickers .07 | work/1078-pickers, .worktrees/1078-pickers | Resume previously reserved task; TS family only, no engine build. Source/reuse research while other session owns heavy queue. |
| Data .12 | work/1078-data, .worktrees/1078-data | Newly claimed independent TS family, research complete; reuse virtualization and existing primitives, no engine build. |
| Feedback parked | .worktrees/1078-feedback-astra | b088d2952 source integrated, no active worker. Cleanup patch .logs/feedback-astra-handover.patch +notes, BacklogAC2 only; finish after1088/1090. |

- Owner requested Astra Fast then `on rebascule`: new workers inherit the coordinator/configured previous model. Launchers keep Fast and optional ZN_CODEX_MODEL override; no global model change. Astra work is preserved, not discarded.
- 1088 latest e020951cc is NOT integrated: stable-ID layout pruning +allocationinlinecost40 +native.systemHost opt-in(defaultfull,auditedsvg lite). Finalrawgate5390968/5423984/6074800B: unused33016passes, used72312>65536 (60,992B total stillneeded). Fullhost mistakenlyretainednetworking added1.13MB; thatcausefixedincheckpoint. NoUI/budgetcuts. Finalcandidate regressions/cache assertion/gallerysmoke needrerun. Runtimeperformanceunmeasured.
- Data grid1093 JSX id blocker claimed; sole core handles after1088. 1094 generic Array.flatMap is also confirmed/claimed; neutral conditional hook ownership and pre-layout scrolling await minimal runtime proof. Runtime/build proofs remain queued behind another session’s restarted Mapper; cheap static checks run bounded without app execution.
- Inputs0a8c0b141 and Navigation3dde12a02 progress integrated, functionalproofsgreen, AC3dependency1088. Oldtrees/artifacts retained for attribution. .07Pickers untouched. Defaultlibraryicons1090 remains unstarted; research references in coordinator messages and task.
- Owner gallery1087 is DONE: c59fa16fa app/password, b189f5bab aspect,414861c46 nestedwrap,5bd6649c3 fullproof. 360/768/1024/1440 defaultnative resize/bounds/scroll/reveal/edit/focus/keys pass. Rootexacttests green, screenshots persisted under docs/img/design. No app workaround, nooursremaining.

## Safe engine and machine

- Main tree has OTHER SESSION uncommitted runtime/LVGL/host work, `src/main.cpp` display hunk, ui.ts Virtual/Fenwick near636/967, changelog/affected/perf lines. Preserve it; never use main/build/zinc for these UI proofs. Tasks844/853/884 belong to other sessions.
- Retained clean tree/binary: `.claude/worktrees/agent-aae96db4e67d4b8e6/build/zinc`, rebuilt with integrated c69f4e7a8. Use ZINC_ROOT=$worker_tree, ZINC=$absolute_clean_binary. Reset the retained tree only when clean; tools/build zinc after a C++ change.
- Heavy commands queue automatically via `/Users/mowmow/Lab/zinc/tools/work-run SECONDS COMMAND ARGS`; git-common-dir flock shared by worktrees, existing timeout kills the command group. No coordinator token waits. The old /tmp/zinc-heavy-run-501.py delegates here.
- Two building trees at most, one heavy process at a time. Headless or ZINC_BACKGROUND=1, bounded runs, no synthetic load or left-over apps. Source reading/editing remains parallel.
- tools/codex-live configures five worker slots for NEW CLI sessions (documented max_threads alias); this session's runtime cap remains three workers. Launch argument mock, linked-tree serialization/exit/timeout regression and skill validation passed. No second coordinator started.

## Latest integrated behavior

- c69f4e7a8, ZN-1086: one non-returning TDZ error constructor shared by inlined guards. Same-source Button ReferenceError allocation sites859→1; guards/value evaluation/errors preserved. Unchanged AOT gate62412 B/component <=65536; no source/budget workaround.
- d78054826 +8fc1bb2d1, ZN-1085: onFocusWithin returns an idempotent registration-specific disposer and snapshots existing focus without an enter callback. Use host.onCleanup(ui.onFocusWithin(...)); Inputs/Overlays migrate their own callers. Exact stale-handle, replacement and keyboard/pointer blur cases pass all3 engines.
- 53009551b, ZN-1078.08: Selection Done after the size fix; mixed native AppKit checkbox, stable React gestures via host.componentRef, filled icons, labelled keyboard controls and light/dark gallery.
- 2a0c72f1f, ZN-1078.10: Overlays Done; dialog/sheet/popover/hover/tooltip/confirmation/tour/toasts, owned deadlines and focus subscriptions,11 real images. Exact Solid/React checks, AOT and unchanged size gate pass.
- e426a7560, ZN-1084/D269: seven UI work scenarios, optional visits and creation/settled/disposal counters, correct-result/provenance gates, memory unavailable=null. Three small artifacts: docs/reports/bench/ui-work-2026-11-09-{qjs64,coarse16,aot16}.json. Four sparse writes64rows:4bindings but528measure/528place/848paint visits; no timing ranking.

## Validation and tests to run (the owner picks)

- Owner asked to test the kit: clean kit_quiet/input/actions/chrome/selection/selection_native/overlays, ui_focus_dispose, tdz_outline, bench_harness and unchanged kit_size passed. Gallery check, brief headless captures and bounded background interactive run passed; no process left. Suites/cross/GPU/full benchmarks not run.
- Next immediate checks are each worker's exact feature/React/native proof, original gallery capture and final unchanged size gate. Inputs is not Done until its own full-source gate passes. Never replace valid user code to hide engine gaps.
- At a chosen milestone: physical keyboard/VoiceOver/touch and native host behavior for kit families; all7 AOT UI work scenes64rows, then quiet-machine scaling; hot_recompile/fast_refresh for TDZ helper keys. RSS/heap, Yoga/style/DOM internals and native host work remain unmeasured.
- All older proposed tests and known machine-specific failures are preserved under Tests to run and topic headings in the archived resume. Do not re-investigate those on unrelated work.

## Owner demo

From the retained clean tree: `ZINC_ROOT=$PWD build/zinc run examples/ui/kit-gallery --interp`. GALLERY=actions/chrome/selection/overlays selects a family; Dark toggles the theme. User was given this command and the loop continues.
